import { Prisma } from '@prisma/client';
import { decifrarSegredo } from '../segredo';
import { custoDoEnvio } from '../../models/custo-envio.model';
import { obterConfiguracao } from '../../models/integracao.model';
import { buscarTemplate } from '../../models/template-mensagem.model';
import {
  listarPendentes,
  marcarLembreteAgendamento,
  reivindicarEnvio,
  atualizarEnvio,
} from '../../models/envio-lembrete.model';
import { carregarAgendamentoMotor, varrerAntecedencias } from './motor';
import { dataCivil } from '../datas';
import { formatarDataPt, interpolarTexto, parametrosWhatsapp } from './placeholders';
import { emailValido, normalizarTelefoneWhatsapp } from './regras';
import { enviarEmailCanal } from './email-canal';
import { enviarTemplateWhatsapp } from './whatsapp-meta';

let ocupado = false;

function credenciaisWhatsapp(config: NonNullable<Awaited<ReturnType<typeof obterConfiguracao>>>) {
  const accessToken = decifrarSegredo(config.whatsappAccessTokenCifrado);
  if (!accessToken || !config.whatsappPhoneNumberId) return null;
  return {
    accessToken,
    phoneNumberId: config.whatsappPhoneNumberId,
    appSecret: decifrarSegredo(config.whatsappAppSecretCifrado),
  };
}

function smtpDaConfig(config: NonNullable<Awaited<ReturnType<typeof obterConfiguracao>>>) {
  return {
    host: config.smtpHost,
    port: config.smtpPort,
    usuario: config.smtpUsuario,
    senha: decifrarSegredo(config.smtpSenhaCifrada),
    remetente: config.smtpRemetente,
    remetenteNome: config.smtpRemetenteNome,
    seguro: config.smtpSeguro,
  };
}

async function processarUm(id: string): Promise<void> {
  const envio = await reivindicarEnvio(id);
  if (!envio) return;

  const config = await obterConfiguracao(envio.clinicaId);
  if (!config?.lembretesAtivos) {
    await atualizarEnvio(envio.id, {
      status: 'cancelado',
      erro: 'Lembretes desativados para a clínica.',
    });
    return;
  }

  const agendamento = await carregarAgendamentoMotor(envio.agendamentoId, envio.clinicaId);
  if (!agendamento) {
    await atualizarEnvio(envio.id, { status: 'falhou', erro: 'Agendamento não encontrado.' });
    return;
  }

  if (envio.tipoLembrete === 'antecedencia' && ['cancelado', 'faltou', 'atendido'].includes(agendamento.status)) {
    await atualizarEnvio(envio.id, {
      status: 'cancelado',
      erro: 'Agendamento não está mais elegível para lembrete de antecedência.',
    });
    return;
  }

  const template = envio.templateId ? await buscarTemplate(envio.templateId, envio.clinicaId) : null;
  const contexto = {
    pacienteNome: agendamento.paciente.nome,
    profissionalNome: agendamento.profissional.nome,
    data: formatarDataPt(dataCivil(agendamento.data) ?? ''),
    horario: agendamento.horaInicio,
    procedimento: agendamento.procedimento.nome,
    unidade: agendamento.unidade.nome,
    sala: agendamento.sala ?? '',
    clinicaNome: agendamento.clinica.nomeFantasia,
    tipoAtendimento: agendamento.tipo === 'avaliacao' ? 'Avaliação' : 'Atendimento',
  };

  if (envio.canal === 'whatsapp') {
    if (!config.whatsappAtivo) {
      await atualizarEnvio(envio.id, { status: 'falhou', erro: 'Integração WhatsApp desativada.' });
      return;
    }
    const credenciais = credenciaisWhatsapp(config);
    if (!credenciais) {
      await atualizarEnvio(envio.id, { status: 'falhou', erro: 'Credenciais da Meta não configuradas.' });
      return;
    }
    const nomeTemplate = template?.whatsappNomeTemplate?.trim();
    if (!nomeTemplate) {
      await atualizarEnvio(envio.id, {
        status: 'falhou',
        erro: 'Template aprovado da Meta não configurado.',
      });
      return;
    }
    const para =
      envio.destinatarioContato ||
      (envio.destinatarioTipo === 'paciente'
        ? normalizarTelefoneWhatsapp(agendamento.paciente.whatsapp || agendamento.paciente.telefone)
        : normalizarTelefoneWhatsapp(agendamento.profissional.telefone));
    if (!para) {
      await atualizarEnvio(envio.id, {
        status: 'falhou',
        erro:
          envio.destinatarioTipo === 'paciente'
            ? 'Paciente sem WhatsApp cadastrado.'
            : 'Profissional sem telefone cadastrado.',
      });
      return;
    }

    const resultado = await enviarTemplateWhatsapp(credenciais, {
      para,
      nomeTemplate,
      idioma: template?.whatsappIdioma || 'pt_BR',
      parametros: template ? parametrosWhatsapp(template.corpo, contexto) : [],
    });

    const categoria = template?.whatsappCategoria || 'utility';
    const custo = resultado.ok ? await custoDoEnvio(envio.clinicaId, 'whatsapp', categoria) : 0;
    await atualizarEnvio(envio.id, {
      status: resultado.ok ? 'enviado' : 'falhou',
      provedorMessageId: resultado.provedorMessageId,
      erro: resultado.ok ? null : resultado.erro,
      destinatarioContato: para,
      custo,
      custoEstimado: config.whatsappCobrancaModo !== 'repasse_plataforma',
      enviadoEm: resultado.ok ? new Date() : null,
      metadados: {
        preview: template ? interpolarTexto(template.corpo, contexto) : null,
        categoria,
      } as Prisma.InputJsonValue,
    });
    if (resultado.ok) await marcarLembreteAgendamento(envio.agendamentoId);
    return;
  }

  if (!config.emailAtivo) {
    await atualizarEnvio(envio.id, { status: 'falhou', erro: 'Integração de e-mail desativada.' });
    return;
  }
  const para =
    emailValido(envio.destinatarioContato) ||
    (envio.destinatarioTipo === 'paciente'
      ? emailValido(agendamento.paciente.email)
      : emailValido(agendamento.profissional.email));
  if (!para) {
    await atualizarEnvio(envio.id, {
      status: 'falhou',
      erro:
        envio.destinatarioTipo === 'paciente'
          ? 'Paciente sem e-mail cadastrado.'
          : 'Profissional sem e-mail cadastrado.',
    });
    return;
  }

  const assunto = interpolarTexto(template?.assunto || 'Lembrete de consulta', contexto);
  const texto = interpolarTexto(template?.corpo || '', contexto);
  const resultado = await enviarEmailCanal(smtpDaConfig(config), { para, assunto, texto });
  const custo = resultado.ok ? await custoDoEnvio(envio.clinicaId, 'email', 'padrao') : 0;
  await atualizarEnvio(envio.id, {
    status: resultado.ok ? 'enviado' : 'falhou',
    provedorMessageId: resultado.provedorMessageId,
    erro: resultado.ok ? null : resultado.erro,
    destinatarioContato: para,
    custo,
    custoEstimado: config.emailCobrancaModo !== 'repasse_plataforma',
    enviadoEm: resultado.ok ? new Date() : null,
    metadados: { preview: texto, assunto } as Prisma.InputJsonValue,
  });
  if (resultado.ok) await marcarLembreteAgendamento(envio.agendamentoId);
}

export async function processarFilaEnvios(): Promise<number> {
  if (ocupado) return 0;
  ocupado = true;
  let processados = 0;
  try {
    await varrerAntecedencias();
    const pendentes = await listarPendentes(new Date(), 40);
    for (const item of pendentes) {
      try {
        await processarUm(item.id);
        processados += 1;
      } catch (err) {
        console.error('[integracoes] erro de processamento', err instanceof Error ? err.message : 'erro');
        await atualizarEnvio(item.id, {
          status: 'falhou',
          erro: 'Erro interno ao processar o envio.',
        }).catch(() => undefined);
      }
    }
  } catch (err) {
    console.error('[integracoes] falha no ciclo de processamento', err instanceof Error ? err.message : 'erro');
  } finally {
    ocupado = false;
  }
  return processados;
}

export function iniciarProcessadorLembretes(intervaloMs: number): NodeJS.Timeout {
  const minimo = Math.max(intervaloMs, 15_000);
  return setInterval(() => {
    void processarFilaEnvios();
  }, minimo);
}

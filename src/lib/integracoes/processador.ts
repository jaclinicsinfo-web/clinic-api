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
import { normalizarTelefoneWhatsapp } from './regras';
import { enviarTemplateWhatsapp } from './whatsapp-meta';
import { comTenant, comoSistema } from '../tenant';

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

async function processarUm(id: string, clinicaId: string): Promise<void> {
  const envio = await reivindicarEnvio(id, clinicaId);
  if (!envio) return;

  const config = await obterConfiguracao(envio.clinicaId);
  if (!config?.lembretesAtivos) {
    await atualizarEnvio(envio.id, envio.clinicaId, {
      status: 'cancelado',
      erro: 'Lembretes desativados para a clínica.',
    });
    return;
  }

  const agendamento = await carregarAgendamentoMotor(envio.agendamentoId, envio.clinicaId);
  if (!agendamento) {
    await atualizarEnvio(envio.id, envio.clinicaId, { status: 'falhou', erro: 'Agendamento não encontrado.' });
    return;
  }

  if (envio.tipoLembrete === 'antecedencia' && ['cancelado', 'faltou', 'atendido'].includes(agendamento.status)) {
    await atualizarEnvio(envio.id, envio.clinicaId, {
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
      await atualizarEnvio(envio.id, envio.clinicaId, { status: 'falhou', erro: 'Integração WhatsApp desativada.' });
      return;
    }
    const credenciais = credenciaisWhatsapp(config);
    if (!credenciais) {
      await atualizarEnvio(envio.id, envio.clinicaId, { status: 'falhou', erro: 'Credenciais da Meta não configuradas.' });
      return;
    }
    const nomeTemplate = template?.whatsappNomeTemplate?.trim();
    if (!nomeTemplate) {
      await atualizarEnvio(envio.id, envio.clinicaId, {
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
      await atualizarEnvio(envio.id, envio.clinicaId, {
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
    await atualizarEnvio(envio.id, envio.clinicaId, {
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
    if (resultado.ok) await marcarLembreteAgendamento(envio.agendamentoId, envio.clinicaId);
    return;
  }

  await atualizarEnvio(envio.id, envio.clinicaId, {
    status: 'cancelado',
    erro: 'Lembretes por e-mail não são enviados.',
  });
}

export async function processarFilaEnvios(clinicaId?: string): Promise<number> {
  if (ocupado) return 0;
  ocupado = true;
  let processados = 0;
  try {
    await varrerAntecedencias(clinicaId);
    const pendentes = await comoSistema(() => listarPendentes(new Date(), 40, clinicaId));
    for (const item of pendentes) {
      await comTenant(item.clinicaId, async () => {
        try {
          await processarUm(item.id, item.clinicaId);
          processados += 1;
        } catch (err) {
          console.error('[integracoes] erro de processamento', err instanceof Error ? err.message : 'erro');
          await atualizarEnvio(item.id, item.clinicaId, {
            status: 'falhou',
            erro: 'Erro interno ao processar o envio.',
          }).catch(() => undefined);
        }
      });
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

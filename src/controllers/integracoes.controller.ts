import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../lib/erros';
import { dataDeIso } from '../lib/datas';
import { cifrarSegredo, decifrarSegredo, ehValorMascarado } from '../lib/segredo';
import { garantirPadrao, obterConfiguracao, salvarConfiguracao } from '../models/integracao.model';
import {
  atualizarRegra,
  buscarRegra,
  criarRegra,
  excluirRegra,
  listarRegras,
} from '../models/regra-lembrete.model';
import {
  atualizarTemplate,
  buscarTemplate,
  criarTemplate,
  excluirTemplate,
  listarTemplates,
} from '../models/template-mensagem.model';
import { listarCustos } from '../models/custo-envio.model';
import { buscarEnvio, listarEnvios, resumoDashboard } from '../models/envio-lembrete.model';
import { processarFilaEnvios } from '../lib/integracoes/processador';
import { enviarTemplateWhatsapp, testarConexaoWhatsapp } from '../lib/integracoes/whatsapp-meta';
import { normalizarTelefoneWhatsapp } from '../lib/integracoes/regras';
import {
  configuracaoBodySchema,
  dashboardQuerySchema,
  enviosQuerySchema,
  idParamSchema,
  regraBodySchema,
  templateBodySchema,
  testeWhatsappSchema,
} from '../validators/integracoes.validator';
import {
  montarConfiguracao,
  montarCusto,
  montarDashboard,
  montarEnvio,
  montarRegra,
  montarTemplate,
} from '../views/integracoes.view';

function urlWebhook(req: Request, clinicaId: string): string {
  const base =
    env.API_PUBLIC_URL ||
    `${(req.headers['x-forwarded-proto'] as string) || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
  return `${base.replace(/\/+$/, '')}/api/webhooks/whatsapp/${clinicaId}`;
}

function periodoFiltro(query: { de?: string; ate?: string }) {
  const de = dataDeIso(query.de);
  let ate = dataDeIso(query.ate);
  if (ate) {
    ate = new Date(ate.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  return { de: de ?? undefined, ate: ate ?? undefined };
}

export async function obterDashboardIntegracoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    await garantirPadrao(clinicaId);
    const query = dashboardQuerySchema.parse(req.query);
    const filtro = { clinicaId, ...periodoFiltro(query), canal: query.canal, status: query.status, tipo: query.tipo };
    const [resumo, envios, config] = await Promise.all([
      resumoDashboard(filtro),
      listarEnvios(filtro, 8),
      garantirPadrao(clinicaId),
    ]);
    res.json(
      montarDashboard(resumo, envios, {
        whatsapp: config?.whatsappCobrancaModo ?? 'conta_clinica',
        email: config?.emailCobrancaModo ?? 'conta_clinica',
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function obterConfiguracaoIntegracoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const config = await garantirPadrao(clinicaId);
    if (!config) throw new AppError(404, 'Configuração de integração não encontrada.');
    res.json(montarConfiguracao(config, { webhookUrl: urlWebhook(req, clinicaId), clinicaId }));
  } catch (err) {
    next(err);
  }
}

export async function atualizarConfiguracaoIntegracoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = configuracaoBodySchema.parse(req.body);
    const atual = await garantirPadrao(clinicaId);
    if (!atual) throw new AppError(404, 'Configuração de integração não encontrada.');

    const patch: Prisma.IntegracaoClinicaUpdateInput = {};
    if (dados.lembretesAtivos != null) patch.lembretesAtivos = dados.lembretesAtivos;
    if (dados.whatsappAtivo != null) patch.whatsappAtivo = dados.whatsappAtivo;
    if (dados.whatsappPhoneNumberId !== undefined) patch.whatsappPhoneNumberId = dados.whatsappPhoneNumberId;
    if (dados.whatsappWabaId !== undefined) patch.whatsappWabaId = dados.whatsappWabaId;
    if (dados.whatsappAppId !== undefined) patch.whatsappAppId = dados.whatsappAppId;
    if (dados.whatsappAmbiente) patch.whatsappAmbiente = dados.whatsappAmbiente;
    if (dados.whatsappCobrancaModo) patch.whatsappCobrancaModo = dados.whatsappCobrancaModo;
    if (dados.whatsappAccessToken && !ehValorMascarado(dados.whatsappAccessToken)) {
      patch.whatsappAccessTokenCifrado = cifrarSegredo(dados.whatsappAccessToken);
    }
    if (dados.whatsappAppSecret && !ehValorMascarado(dados.whatsappAppSecret)) {
      patch.whatsappAppSecretCifrado = cifrarSegredo(dados.whatsappAppSecret);
    }
    if (dados.whatsappVerifyToken && !ehValorMascarado(dados.whatsappVerifyToken)) {
      patch.whatsappVerifyTokenCifrado = cifrarSegredo(dados.whatsappVerifyToken);
    }

    const salvo = await salvarConfiguracao(clinicaId, patch);
    res.json(montarConfiguracao(salvo, { webhookUrl: urlWebhook(req, clinicaId), clinicaId }));
  } catch (err) {
    next(err);
  }
}

export async function testarWhatsapp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const { para } = testeWhatsappSchema.parse(req.body);
    const config = await obterConfiguracao(clinicaId);
    const token = decifrarSegredo(config?.whatsappAccessTokenCifrado);
    if (!config || !token || !config.whatsappPhoneNumberId) {
      throw new AppError(400, 'Configure o token e o Phone Number ID da Meta antes de testar.');
    }
    const conexao = await testarConexaoWhatsapp({
      accessToken: token,
      phoneNumberId: config.whatsappPhoneNumberId,
    });
    if (!conexao.ok) {
      throw new AppError(400, conexao.erro ?? 'Falha ao autenticar na Meta.');
    }
    const destino = normalizarTelefoneWhatsapp(para);
    if (!destino) throw new AppError(400, 'Número de WhatsApp inválido.');

    const templates = await listarTemplates(clinicaId);
    const template = templates.find((item) => item.canal === 'whatsapp' && item.whatsappNomeTemplate);
    if (!template?.whatsappNomeTemplate) {
      res.json({ ok: true, message: 'Conexão com a Meta validada. Configure um template aprovado para enviar mensagens.' });
      return;
    }
    const envio = await enviarTemplateWhatsapp(
      { accessToken: token, phoneNumberId: config.whatsappPhoneNumberId },
      {
        para: destino,
        nomeTemplate: template.whatsappNomeTemplate,
        idioma: template.whatsappIdioma,
        parametros: ['Teste', 'J.A. Clinics', 'hoje', '00:00'],
      },
    );
    if (!envio.ok) throw new AppError(400, envio.erro ?? 'Falha ao enviar a mensagem de teste.');
    res.json({ ok: true, message: 'Mensagem de teste enviada.' });
  } catch (err) {
    next(err);
  }
}

export async function obterRegras(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await garantirPadrao(req.auth!.clinicaId);
    const regras = await listarRegras(req.auth!.clinicaId);
    res.json({
      regras: regras.filter((regra) => regra.canais.includes('whatsapp')).map(montarRegra),
    });
  } catch (err) {
    next(err);
  }
}

export async function criarRegraLembrete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = regraBodySchema.parse(req.body);
    await validarTemplatesRegra(clinicaId, dados);
    const criada = await criarRegra({
      clinicaId,
      nome: dados.nome,
      tipo: dados.tipo,
      antecedenciaMinutos: dados.tipo === 'antecedencia' ? dados.antecedenciaMinutos ?? null : null,
      destinatarios: dados.destinatarios,
      canais: dados.canais,
      templateWhatsappId: dados.templateWhatsappId ?? null,
      templateEmailId: dados.templateEmailId ?? null,
      ativo: dados.ativo ?? true,
      ordem: dados.ordem ?? 10,
    });
    res.status(201).json({ regra: montarRegra(criada) });
  } catch (err) {
    next(err);
  }
}

export async function atualizarRegraLembrete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const { id } = idParamSchema.parse(req.params);
    const existente = await buscarRegra(id, clinicaId);
    if (!existente) throw new AppError(404, 'Regra não encontrada.');
    const dados = regraBodySchema.parse(req.body);
    await validarTemplatesRegra(clinicaId, dados);
    const atualizada = await atualizarRegra(id, clinicaId, {
      nome: dados.nome,
      tipo: dados.tipo,
      antecedenciaMinutos: dados.tipo === 'antecedencia' ? dados.antecedenciaMinutos ?? null : null,
      destinatarios: dados.destinatarios,
      canais: dados.canais,
      templateWhatsappId: dados.templateWhatsappId ?? null,
      templateEmailId: dados.templateEmailId ?? null,
      ativo: dados.ativo ?? existente.ativo,
      ordem: dados.ordem ?? existente.ordem,
    });
    if (!atualizada) throw new AppError(404, 'Regra não encontrada.');
    res.json({ regra: montarRegra(atualizada) });
  } catch (err) {
    next(err);
  }
}

export async function excluirRegraLembrete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existente = await buscarRegra(id, req.auth!.clinicaId);
    if (!existente) throw new AppError(404, 'Regra não encontrada.');
    await excluirRegra(id, req.auth!.clinicaId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function obterTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await garantirPadrao(req.auth!.clinicaId);
    const templates = await listarTemplates(req.auth!.clinicaId);
    res.json({ templates: templates.filter((item) => item.canal === 'whatsapp').map(montarTemplate) });
  } catch (err) {
    next(err);
  }
}

export async function criarTemplateMensagem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dados = templateBodySchema.parse(req.body);
    const criado = await criarTemplate({
      clinicaId: req.auth!.clinicaId,
      canal: dados.canal,
      tipo: dados.tipo,
      nome: dados.nome,
      assunto: dados.assunto,
      corpo: dados.corpo,
      whatsappNomeTemplate: dados.whatsappNomeTemplate,
      whatsappIdioma: dados.whatsappIdioma ?? 'pt_BR',
      whatsappCategoria: dados.whatsappCategoria ?? 'utility',
      ativo: dados.ativo ?? true,
    });
    res.status(201).json({ template: montarTemplate(criado) });
  } catch (err) {
    next(err);
  }
}

export async function atualizarTemplateMensagem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existente = await buscarTemplate(id, req.auth!.clinicaId);
    if (!existente) throw new AppError(404, 'Template não encontrado.');
    const dados = templateBodySchema.parse(req.body);
    const atualizado = await atualizarTemplate(id, req.auth!.clinicaId, {
      canal: dados.canal,
      tipo: dados.tipo,
      nome: dados.nome,
      assunto: dados.assunto,
      corpo: dados.corpo,
      whatsappNomeTemplate: dados.whatsappNomeTemplate,
      whatsappIdioma: dados.whatsappIdioma ?? existente.whatsappIdioma,
      whatsappCategoria: dados.whatsappCategoria ?? existente.whatsappCategoria,
      ativo: dados.ativo ?? existente.ativo,
    });
    if (!atualizado) throw new AppError(404, 'Template não encontrado.');
    res.json({ template: montarTemplate(atualizado) });
  } catch (err) {
    next(err);
  }
}

export async function excluirTemplateMensagem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const existente = await buscarTemplate(id, req.auth!.clinicaId);
    if (!existente) throw new AppError(404, 'Template não encontrado.');
    if (existente.sistema) throw new AppError(400, 'Templates padrão não podem ser excluídos.');
    await excluirTemplate(id, req.auth!.clinicaId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function obterCustos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await garantirPadrao(req.auth!.clinicaId);
    const custos = await listarCustos(req.auth!.clinicaId);
    res.json({ custos: custos.map(montarCusto) });
  } catch (err) {
    next(err);
  }
}

export async function obterHistoricoEnvios(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = enviosQuerySchema.parse(req.query);
    const filtro = {
      clinicaId: req.auth!.clinicaId,
      ...periodoFiltro(query),
      canal: query.canal,
      status: query.status,
      tipo: query.tipo,
    };
    const envios = await listarEnvios(filtro, 300);
    const busca = query.busca?.trim().toLowerCase();
    const filtrados = busca
      ? envios.filter(
          (item) =>
            item.destinatarioNome.toLowerCase().includes(busca) ||
            item.agendamento.paciente.nome.toLowerCase().includes(busca) ||
            item.agendamento.profissional.nome.toLowerCase().includes(busca),
        )
      : envios;
    res.json({ envios: filtrados.map(montarEnvio) });
  } catch (err) {
    next(err);
  }
}

export async function obterEnvio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const envio = await buscarEnvio(id, req.auth!.clinicaId);
    if (!envio) throw new AppError(404, 'Envio não encontrado.');
    res.json({ envio: montarEnvio(envio) });
  } catch (err) {
    next(err);
  }
}

export async function processarIntegracoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const processados = await processarFilaEnvios(req.auth!.clinicaId);
    res.json({ ok: true, processados });
  } catch (err) {
    next(err);
  }
}

async function validarTemplatesRegra(
  clinicaId: string,
  dados: { templateWhatsappId?: string | null; templateEmailId?: string | null; canais: string[] },
) {
  if (dados.canais.includes('whatsapp') && dados.templateWhatsappId) {
    const template = await buscarTemplate(dados.templateWhatsappId, clinicaId);
    if (!template || template.canal !== 'whatsapp') {
      throw new AppError(400, 'Template de WhatsApp inválido.');
    }
  }
  if (dados.canais.includes('email') && dados.templateEmailId) {
    const template = await buscarTemplate(dados.templateEmailId, clinicaId);
    if (!template || template.canal !== 'email') {
      throw new AppError(400, 'Template de e-mail inválido.');
    }
  }
}

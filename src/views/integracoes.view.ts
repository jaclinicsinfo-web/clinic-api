import { dataCivil, dinheiro } from '../lib/datas';
import { mascararPresente } from '../lib/segredo';
import { EnvioCompleto } from '../models/envio-lembrete.model';

function iso(valor: Date | null | undefined): string | null {
  return valor ? valor.toISOString() : null;
}

export function montarConfiguracao(
  config: {
    lembretesAtivos: boolean;
    whatsappAtivo: boolean;
    whatsappPhoneNumberId: string | null;
    whatsappWabaId: string | null;
    whatsappAppId: string | null;
    whatsappAccessTokenCifrado: string | null;
    whatsappAppSecretCifrado: string | null;
    whatsappVerifyTokenCifrado: string | null;
    whatsappAmbiente: string;
    whatsappCobrancaModo?: string;
    emailAtivo: boolean;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUsuario: string | null;
    smtpSenhaCifrada: string | null;
    smtpRemetente: string | null;
    smtpRemetenteNome: string | null;
    smtpSeguro: string;
    emailCobrancaModo?: string;
  },
  extras: { webhookUrl: string; clinicaId: string },
) {
  return {
    clinicaId: extras.clinicaId,
    lembretesAtivos: config.lembretesAtivos,
    webhookUrl: extras.webhookUrl,
    whatsapp: {
      ativo: config.whatsappAtivo,
      configurado: Boolean(config.whatsappAccessTokenCifrado && config.whatsappPhoneNumberId),
      phoneNumberId: config.whatsappPhoneNumberId,
      wabaId: config.whatsappWabaId,
      appId: config.whatsappAppId,
      ambiente: config.whatsappAmbiente,
      accessTokenMascarado: mascararPresente(config.whatsappAccessTokenCifrado),
      appSecretMascarado: mascararPresente(config.whatsappAppSecretCifrado),
      verifyTokenMascarado: mascararPresente(config.whatsappVerifyTokenCifrado),
      cobrancaModo: config.whatsappCobrancaModo === 'repasse_plataforma' ? 'repasse_plataforma' : 'conta_clinica',
    },
    email: {
      ativo: config.emailAtivo,
      configurado: Boolean(config.smtpHost && config.smtpRemetente),
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUsuario: config.smtpUsuario,
      smtpSenhaMascarada: mascararPresente(config.smtpSenhaCifrada),
      smtpRemetente: config.smtpRemetente,
      smtpRemetenteNome: config.smtpRemetenteNome,
      smtpSeguro: config.smtpSeguro,
      cobrancaModo: config.emailCobrancaModo === 'repasse_plataforma' ? 'repasse_plataforma' : 'conta_clinica',
    },
  };
}

export function montarRegra(regra: {
  id: string;
  nome: string;
  tipo: string;
  antecedenciaMinutos: number | null;
  destinatarios: string;
  canais: string[];
  templateWhatsappId: string | null;
  templateEmailId: string | null;
  ativo: boolean;
  sistema: boolean;
  ordem: number;
  templateWhatsapp?: { id: string; nome: string } | null;
  templateEmail?: { id: string; nome: string } | null;
}) {
  return {
    id: regra.id,
    nome: regra.nome,
    tipo: regra.tipo,
    antecedenciaMinutos: regra.antecedenciaMinutos,
    destinatarios: regra.destinatarios,
    canais: regra.canais,
    templateWhatsappId: regra.templateWhatsappId,
    templateEmailId: regra.templateEmailId,
    templateWhatsappNome: regra.templateWhatsapp?.nome ?? null,
    templateEmailNome: regra.templateEmail?.nome ?? null,
    ativo: regra.ativo,
    sistema: regra.sistema,
    ordem: regra.ordem,
  };
}

export function montarTemplate(template: {
  id: string;
  canal: string;
  tipo: string;
  nome: string;
  assunto: string | null;
  corpo: string;
  whatsappNomeTemplate: string | null;
  whatsappIdioma: string;
  whatsappCategoria: string;
  ativo: boolean;
  sistema: boolean;
}) {
  return {
    id: template.id,
    canal: template.canal,
    tipo: template.tipo,
    nome: template.nome,
    assunto: template.assunto,
    corpo: template.corpo,
    whatsappNomeTemplate: template.whatsappNomeTemplate,
    whatsappIdioma: template.whatsappIdioma,
    whatsappCategoria: template.whatsappCategoria,
    ativo: template.ativo,
    sistema: template.sistema,
  };
}

export function montarCusto(custo: {
  id: string;
  canal: string;
  categoria: string;
  valor: { toString(): string };
  moeda: string;
  ativo: boolean;
}) {
  return {
    id: custo.id,
    canal: custo.canal,
    categoria: custo.categoria,
    valor: dinheiro(custo.valor),
    moeda: custo.moeda,
    ativo: custo.ativo,
  };
}

export function montarEnvio(envio: EnvioCompleto) {
  const metadados =
    envio.metadados && typeof envio.metadados === 'object' && !Array.isArray(envio.metadados)
      ? (envio.metadados as Record<string, unknown>)
      : {};
  return {
    id: envio.id,
    agendamentoId: envio.agendamentoId,
    agendamentoData: dataCivil(envio.agendamento.data),
    agendamentoHora: envio.agendamento.horaInicio,
    agendamentoStatus: envio.agendamento.status,
    pacienteNome: envio.agendamento.paciente.nome,
    profissionalNome: envio.agendamento.profissional.nome,
    regraNome: envio.regra?.nome ?? null,
    templateNome: envio.template?.nome ?? null,
    canal: envio.canal,
    destinatarioTipo: envio.destinatarioTipo,
    destinatarioNome: envio.destinatarioNome,
    destinatarioContato: envio.destinatarioContato,
    tipoLembrete: envio.tipoLembrete,
    status: envio.status,
    provedorMessageId: envio.provedorMessageId,
    erro: envio.erro,
    custo: dinheiro(envio.custo),
    custoEstimado: envio.custoEstimado,
    tentativas: envio.tentativas,
    preview: typeof metadados.preview === 'string' ? metadados.preview : null,
    processarEm: iso(envio.processarEm),
    enviadoEm: iso(envio.enviadoEm),
    entregueEm: iso(envio.entregueEm),
    lidoEm: iso(envio.lidoEm),
    criadoEm: iso(envio.criadoEm),
  };
}

export function montarDashboard(
  resumo: Record<string, number>,
  envios: EnvioCompleto[],
  cobranca?: { whatsapp: string; email: string },
) {
  return {
    resumo,
    cobranca: {
      whatsapp: cobranca?.whatsapp === 'repasse_plataforma' ? 'repasse_plataforma' : 'conta_clinica',
      email: cobranca?.email === 'repasse_plataforma' ? 'repasse_plataforma' : 'conta_clinica',
    },
    envios: envios.slice(0, 8).map(montarEnvio),
  };
}

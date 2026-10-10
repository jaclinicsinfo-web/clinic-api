import type { MarcoCobranca } from '../../assinatura';
import { montarHtmlTransacional, montarTextoTransacional, type BlocoEmail } from '../layout';

const SISTEMA = 'J.A. Clinics';

function reais(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function data(valor: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(valor);
}

/** "hoje", "amanhã", "em 3 dias", "há 2 dias" — conta dias de calendário em São Paulo. */
export function prazoRelativo(alvo: Date, agora = new Date()): string {
  const dia = (d: Date) => {
    const [a, m, dd] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d).split('-').map(Number);
    return Date.UTC(a, m - 1, dd) / 86_400_000;
  };
  const diferenca = dia(alvo) - dia(agora);
  if (diferenca === 0) return 'hoje';
  if (diferenca === 1) return 'amanhã';
  if (diferenca === -1) return 'ontem';
  return diferenca > 0 ? `em ${diferenca} dias` : `há ${-diferenca} dias`;
}

function montar(bloco: BlocoEmail, assunto: string) {
  return {
    assunto,
    remetenteNome: SISTEMA,
    texto: montarTextoTransacional(bloco),
    html: montarHtmlTransacional(bloco),
  };
}

export interface DadosLembrete {
  marco: MarcoCobranca;
  clinica: string;
  nomeAdmin?: string | null;
  plano: string;
  ciclo: 'mensal' | 'anual';
  valor: number;
  /** Vencimento do período pago, ou fim do teste. */
  vence: Date;
  /** Quando o acesso é bloqueado se nada for pago. */
  bloqueia: Date;
  /** Configurações › Assinatura (antes do bloqueio) ou login (bloqueada). */
  link: string;
  agora?: Date;
}

export function montarEmailLembrete(dados: DadosLembrete) {
  const agora = dados.agora ?? new Date();
  const ola = dados.nomeAdmin ? `Olá, ${dados.nomeAdmin.trim().split(/\s+/)[0]}.` : 'Olá.';
  const cobranca = `Plano ${dados.plano} ${dados.ciclo === 'anual' ? 'anual' : 'mensal'}: ${reais(dados.valor)}${dados.ciclo === 'anual' ? ' por ano (Pix à vista ou cartão em até 12x)' : ' por mês (Pix ou cartão)'}.`;
  const base = { marca: SISTEMA, organizacao: dados.clinica };

  if (dados.marco === 'teste-2' || dados.marco === 'teste-fim') {
    const terminou = dados.marco === 'teste-fim';
    return montar(
      {
        ...base,
        preheader: terminou ? 'O teste grátis terminou. Escolha um plano para continuar.' : `Seu teste grátis termina ${prazoRelativo(dados.vence, agora)}.`,
        titulo: terminou ? 'Seu teste grátis terminou' : `Seu teste termina ${prazoRelativo(dados.vence, agora)}`,
        paragrafos: [
          ola,
          terminou
            ? `O teste grátis da ${dados.clinica} terminou em ${data(dados.vence)}. Os dados continuam guardados: escolha um plano para voltar a usar.`
            : `O teste grátis da ${dados.clinica} vale até ${data(dados.vence)}. Para não interromper o uso, escolha um plano antes disso. O que sobrar do teste é somado ao primeiro período pago.`,
          'O pagamento é pelo Mercado Pago, com Pix ou cartão.',
        ],
        botao: { rotulo: terminou ? 'Escolher um plano' : 'Assinar agora', url: dados.link },
      },
      terminou ? `O teste da ${dados.clinica} terminou` : `O teste da ${dados.clinica} termina ${prazoRelativo(dados.vence, agora)}`,
    );
  }

  const antes = dados.marco === 'D-30' || dados.marco === 'D-5' || dados.marco === 'D-1' || dados.marco === 'D0';
  if (antes) {
    const prazo = prazoRelativo(dados.vence, agora);
    return montar(
      {
        ...base,
        preheader: `A assinatura vence ${prazo} (${data(dados.vence)}).`,
        titulo: `Sua assinatura vence ${prazo}`,
        paragrafos: [
          ola,
          `A assinatura da ${dados.clinica} vence em ${data(dados.vence)}. Pague até essa data para o acesso seguir sem interrupção. Pagando antes, o novo período começa no vencimento: nenhum dia se perde.`,
          cobranca,
        ],
        botao: { rotulo: 'Pagar agora', url: dados.link },
      },
      `A assinatura da ${dados.clinica} vence ${prazo}`,
    );
  }

  if (dados.marco === 'D+5') {
    return montar(
      {
        ...base,
        preheader: 'O acesso foi bloqueado. Pague para voltar a usar.',
        titulo: 'O acesso foi bloqueado',
        paragrafos: [
          ola,
          `A assinatura da ${dados.clinica} venceu em ${data(dados.vence)} e o prazo de 5 dias terminou. Os dados continuam guardados.`,
          'Para voltar, entre no sistema com o e-mail do administrador: a tela de login mostra os planos para pagar. O acesso volta assim que o Mercado Pago confirmar.',
          cobranca,
        ],
        botao: { rotulo: 'Pagar e voltar a usar', url: dados.link },
      },
      `Acesso da ${dados.clinica} bloqueado: pague para voltar`,
    );
  }

  const ultimo = dados.marco === 'D+3';
  const prazoBloqueio = prazoRelativo(dados.bloqueia, agora);
  return montar(
    {
      ...base,
      preheader: `Pagamento pendente. O acesso será bloqueado ${prazoBloqueio}.`,
      titulo: ultimo ? `Último aviso: bloqueio ${prazoBloqueio}` : 'Pagamento pendente',
      paragrafos: [
        ola,
        `A assinatura da ${dados.clinica} venceu em ${data(dados.vence)}. O sistema continua liberado até ${data(dados.bloqueia)}; depois disso, o acesso é bloqueado até o pagamento.`,
        cobranca,
      ],
      botao: { rotulo: 'Pagar agora', url: dados.link },
      aviso: 'Se você já pagou, desconsidere este e-mail. A confirmação do Mercado Pago pode levar alguns minutos.',
    },
    ultimo ? `Último aviso: acesso da ${dados.clinica} bloqueado ${prazoBloqueio}` : `Pagamento pendente da ${dados.clinica}`,
  );
}

export interface DadosRecibo {
  clinica: string;
  nomeAdmin?: string | null;
  plano: string;
  ciclo: 'mensal' | 'anual';
  valor: number;
  meio?: string | null;
  parcelas?: number | null;
  periodoInicio: Date;
  periodoFim: Date;
  pagamentoId?: string | null;
  link: string;
}

export function montarEmailRecibo(dados: DadosRecibo) {
  const meio =
    dados.meio === 'pix'
      ? 'Pix'
      : dados.meio === 'cartao_credito'
        ? `Cartão de crédito${dados.parcelas && dados.parcelas > 1 ? ` em ${dados.parcelas}x` : ' à vista'}`
        : null;
  const linhas = [
    `Plano: ${dados.plano} ${dados.ciclo === 'anual' ? 'anual' : 'mensal'}`,
    `Valor: ${reais(dados.valor)}`,
    ...(meio ? [`Pagamento: ${meio}`] : []),
    `Período: ${data(dados.periodoInicio)} a ${data(dados.periodoFim)}`,
    ...(dados.pagamentoId ? [`Número no Mercado Pago: ${dados.pagamentoId}`] : []),
  ];
  return montar(
    {
      marca: SISTEMA,
      organizacao: dados.clinica,
      preheader: `Pagamento confirmado. A assinatura vale até ${data(dados.periodoFim)}.`,
      titulo: 'Pagamento confirmado',
      paragrafos: [
        dados.nomeAdmin ? `Olá, ${dados.nomeAdmin.trim().split(/\s+/)[0]}.` : 'Olá.',
        `Recebemos o pagamento da ${dados.clinica}. A assinatura vale até ${data(dados.periodoFim)}.`,
        ...linhas,
      ],
      botao: { rotulo: 'Abrir o sistema', url: dados.link },
      aviso: 'Este e-mail é o comprovante do pagamento. Guarde-o.',
    },
    `Pagamento confirmado — ${dados.clinica}`,
  );
}

import { env } from '../config/env';
import { formatarDataAcesso } from '../lib/assinatura';
import { escaparHtml } from '../lib/email/html';
import { AppError } from '../lib/erros';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';
import { buscarPorId as buscarClinica } from '../models/clinica.model';
import { buscarPagamentoClinica, ehUpgrade, listarPagamentosClinica } from '../models/pedido-assinatura.model';
import { listarPlanos } from '../models/plano.model';
import { buscarPorId as buscarUsuario } from '../models/usuario.model';
import type { AcessoPagamento } from './assinatura.service';

type Pedido = Awaited<ReturnType<typeof listarPagamentosClinica>>[number];

async function exigirAdministrador(acesso: AcessoPagamento) {
  const usuario = await buscarUsuario(acesso.usuarioId);
  if (!usuario || usuario.clinicaId !== acesso.clinicaId || usuario.status !== 'ativo') {
    throw new AppError(401, 'Sessão expirada. Entre novamente.');
  }
  if (usuario.perfil.nome !== NOME_PERFIL_ADMINISTRADOR) {
    throw new AppError(403, 'Só o administrador da clínica vê os pagamentos da assinatura.');
  }
}

function reais(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function ciclo(valor: string) {
  return valor === 'anual' ? 'anual' : 'mensal';
}

function descricao(pedido: Pedido, nomePlano: string): string {
  if (pedido.tipo === 'troca_plano') {
    return ehUpgrade(pedido)
      ? `Troca para o plano ${nomePlano} (proporcional)`
      : `Troca para o plano ${nomePlano} ${ciclo(pedido.ciclo)}${Number(pedido.credito ?? 0) > 0 ? ` (com crédito de ${reais(Number(pedido.credito))})` : ''}`;
  }
  if (pedido.tipo === 'recorrente') return `Cobrança automática · Plano ${nomePlano} ${ciclo(pedido.ciclo)}`;
  return `Plano ${nomePlano} ${ciclo(pedido.ciclo)}`;
}

function meioPorExtenso(meio: string | null, parcelas: number | null): string | null {
  if (meio === 'pix') return 'Pix';
  if (meio === 'cartao_credito') return parcelas && parcelas > 1 ? `Cartão de crédito em ${parcelas}x` : 'Cartão de crédito à vista';
  return meio;
}

async function nomesDosPlanos() {
  const planos = await listarPlanos();
  return new Map(planos.map((plano) => [plano.codigo, plano.nome]));
}

function paraLista(pedido: Pedido, nomes: Map<string, string>) {
  const nomePlano = nomes.get(pedido.planoCodigo) ?? pedido.planoCodigo;
  return {
    id: pedido.id,
    numeroRecibo: pedido.numeroRecibo,
    data: (pedido.pagoEm ?? pedido.criadoEm).toISOString(),
    descricao: descricao(pedido, nomePlano),
    tipo: pedido.tipo,
    plano: { codigo: pedido.planoCodigo, nome: nomePlano },
    ciclo: ciclo(pedido.ciclo),
    valor: Number(pedido.valor),
    totalPago: pedido.totalPago === null ? null : Number(pedido.totalPago),
    meio: pedido.meio,
    parcelas: pedido.parcelas,
    periodoInicio: pedido.periodoInicio?.toISOString() ?? null,
    periodoFim: pedido.periodoFim?.toISOString() ?? null,
    status: pedido.status as 'pago' | 'estornado',
    estornadoEm: pedido.estornadoEm?.toISOString() ?? null,
    pagamentoId: pedido.pagamentoId,
  };
}

export async function listarPagamentos(acesso: AcessoPagamento) {
  await exigirAdministrador(acesso);
  const [pedidos, nomes] = await Promise.all([listarPagamentosClinica(acesso.clinicaId), nomesDosPlanos()]);
  return { pagamentos: pedidos.map((pedido) => paraLista(pedido, nomes)) };
}

function cnpjFormatado(valor: string) {
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length !== 14) return valor;
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function linha(rotulo: string, valor: string | null | undefined) {
  if (!valor) return '';
  return `<tr><th>${escaparHtml(rotulo)}</th><td>${escaparHtml(valor)}</td></tr>`;
}

/**
 * Recibo do pagamento em HTML para imprimir ou salvar em PDF (A4). Todo dado da clínica é escapado:
 * o web-app escreve este HTML numa aba do próprio domínio. Não chama print(): o web-app chama.
 */
export async function reciboHtml(acesso: AcessoPagamento, pedidoId: string): Promise<string> {
  await exigirAdministrador(acesso);
  const pedido = await buscarPagamentoClinica(pedidoId, acesso.clinicaId);
  if (!pedido || pedido.numeroRecibo === null) throw new AppError(404, 'Pagamento não encontrado.');
  const clinica = await buscarClinica(acesso.clinicaId);
  if (!clinica) throw new AppError(404, 'Clínica não encontrada.');
  const item = paraLista(pedido, await nomesDosPlanos());

  const numero = String(item.numeroRecibo).padStart(6, '0');
  const pagoEm = formatarDataAcesso(new Date(item.data));
  const periodo =
    pedido.periodoInicio && pedido.periodoFim
      ? `${formatarDataAcesso(pedido.periodoInicio)} a ${formatarDataAcesso(pedido.periodoFim)}`
      : null;
  const endereco = [
    [clinica.rua, clinica.numero].filter(Boolean).join(', '),
    clinica.complemento,
    clinica.bairro,
    [clinica.cidade, clinica.uf].filter(Boolean).join('/'),
    clinica.cep,
  ]
    .filter(Boolean)
    .join(' · ');
  const comJuros = item.totalPago !== null && Math.abs(item.totalPago - item.valor) >= 0.01;
  const emissor = env.RECIBO_EMISSOR_NOME;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recibo nº ${numero} — ${escaparHtml(emissor)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f6f7f9; color: #0f1a24; font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .folha { max-width: 210mm; margin: 24px auto; background: #fff; padding: 18mm; border: 1px solid #e2e6ec; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #0c3f4a; padding-bottom: 16px; }
  h1 { margin: 0; font-size: 22px; color: #0c3f4a; }
  .numero { text-align: right; font-size: 13px; color: #5c6b7a; }
  .numero strong { display: block; font-size: 18px; color: #0f1a24; }
  h2 { margin: 24px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #5c6b7a; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 0; vertical-align: top; border-bottom: 1px solid #eef1f4; }
  th { width: 38%; font-weight: 500; color: #5c6b7a; }
  .valor { margin-top: 24px; display: flex; justify-content: space-between; align-items: baseline; padding: 14px 16px; background: #f1f6f7; border-radius: 8px; }
  .valor strong { font-size: 22px; }
  .devolvido { margin-top: 16px; padding: 10px 14px; border: 1px solid #f3c2c2; background: #fdf1f1; color: #9b1c1c; border-radius: 8px; }
  footer { margin-top: 32px; font-size: 12px; color: #5c6b7a; }
  @media print {
    body { background: #fff; }
    .folha { margin: 0; padding: 0; border: 0; max-width: none; }
  }
</style>
</head>
<body>
<main class="folha">
  <header>
    <div>
      <h1>Recibo de pagamento</h1>
      <div>${escaparHtml(emissor)}${env.RECIBO_EMISSOR_CNPJ ? ` · CNPJ ${escaparHtml(cnpjFormatado(env.RECIBO_EMISSOR_CNPJ))}` : ''}</div>
      ${env.RECIBO_EMISSOR_ENDERECO ? `<div>${escaparHtml(env.RECIBO_EMISSOR_ENDERECO)}</div>` : ''}
    </div>
    <div class="numero">Recibo nº<strong>${numero}</strong>${escaparHtml(pagoEm)}</div>
  </header>

  ${
    item.status === 'estornado'
      ? `<div class="devolvido">Pagamento devolvido${item.estornadoEm ? ` em ${escaparHtml(formatarDataAcesso(new Date(item.estornadoEm)))}` : ''}. Este recibo fica só como registro.</div>`
      : ''
  }

  <h2>Recebemos de</h2>
  <table>
    ${linha('Razão social', clinica.razaoSocial)}
    ${linha('Nome fantasia', clinica.nomeFantasia)}
    ${linha('CNPJ', cnpjFormatado(clinica.cnpj))}
    ${linha('Endereço', endereco)}
  </table>

  <h2>Referente a</h2>
  <table>
    ${linha('Descrição', item.descricao)}
    ${linha('Período', periodo)}
    ${linha('Forma de pagamento', meioPorExtenso(item.meio, item.parcelas))}
    ${linha('Data do pagamento', pagoEm)}
    ${linha('Número no Mercado Pago', item.pagamentoId)}
  </table>

  <div class="valor"><span>Valor${comJuros ? ' da assinatura' : ''}</span><strong>${escaparHtml(reais(item.valor))}</strong></div>
  ${comJuros ? `<p>Total pago no cartão, com os juros do parcelamento: ${escaparHtml(reais(item.totalPago!))}.</p>` : ''}

  <footer>
    Este recibo comprova o pagamento da assinatura do sistema ${escaparHtml(emissor)} e não substitui a nota fiscal.
  </footer>
</main>
</body>
</html>`;
}

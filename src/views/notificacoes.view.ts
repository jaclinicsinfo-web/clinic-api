import { Notificacao } from '@prisma/client';

export function notificacaoResumo(notificacao: Notificacao) {
  return {
    id: notificacao.id,
    tipo: notificacao.tipo,
    titulo: notificacao.titulo,
    descricao: notificacao.descricao,
    href: notificacao.href,
    severidade: notificacao.severidade as 'alta' | 'media' | 'baixa',
    lida: Boolean(notificacao.lidaEm),
    criadoEm: notificacao.criadoEm.toISOString(),
  };
}

export function montarListaNotificacoes(notificacoes: Notificacao[]) {
  const itens = notificacoes.map(notificacaoResumo);
  return {
    notificacoes: itens,
    naoLidas: itens.filter((item) => !item.lida).length,
  };
}

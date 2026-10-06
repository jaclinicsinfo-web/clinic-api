import { prisma } from '../config/database';
import { hojeCivil } from '../lib/datas';
import { wherePacienteDoProfissional } from '../lib/escopo-dados';
import { temPermissao } from '../lib/permissoes';
import { listarAbaixoDoMinimo } from './estoque.model';

export interface AlertaOperacional {
  chave: string;
  tipo: string;
  titulo: string;
  descricao: string;
  href: string;
  severidade: 'alta' | 'media' | 'baixa';
}

const CHAVES_OPERACIONAIS = ['estoque-baixo', 'despesas-vencidas', 'carteirinhas'] as const;

export async function coletarAlertas(params: {
  clinicaId: string;
  permissoes: unknown;
  isolarDados?: boolean;
  profissionalId?: string | null;
}): Promise<AlertaOperacional[]> {
  const alertas: AlertaOperacional[] = [];
  const hoje = hojeCivil();

  if (temPermissao(params.permissoes, 'estoque', 'visualizar')) {
    const abaixo = await listarAbaixoDoMinimo(params.clinicaId);
    if (abaixo.length > 0) {
      alertas.push({
        chave: 'estoque-baixo',
        tipo: 'estoque_baixo',
        titulo: `${abaixo.length} ${abaixo.length === 1 ? 'item abaixo' : 'itens abaixo'} do estoque mínimo`,
        descricao: abaixo
          .slice(0, 3)
          .map((item) => item.nome)
          .join(', '),
        href: '/estoque',
        severidade: 'alta',
      });
    }
  }

  if (temPermissao(params.permissoes, 'financeiro', 'visualizar') && !params.isolarDados) {
    const vencidas = await prisma.despesa.count({
      where: {
        clinicaId: params.clinicaId,
        status: { not: 'pago' },
        vencimento: { lt: new Date(`${hoje}T00:00:00.000Z`) },
      },
    });
    if (vencidas > 0) {
      alertas.push({
        chave: 'despesas-vencidas',
        tipo: 'despesa_vencida',
        titulo: `${vencidas} ${vencidas === 1 ? 'despesa vencida' : 'despesas vencidas'}`,
        descricao: 'Verifique o módulo de contas a pagar para regularizar.',
        href: '/financeiro/contas-a-pagar',
        severidade: 'alta',
      });
    }
  }

  if (temPermissao(params.permissoes, 'pacientes', 'visualizar') && !(params.isolarDados && !params.profissionalId)) {
    const limite = new Date();
    limite.setUTCMonth(limite.getUTCMonth() + 6);
    const escopoPaciente = params.profissionalId ? wherePacienteDoProfissional(params.profissionalId) : {};
    const carteirinhas = await prisma.paciente.findMany({
      where: {
        clinicaId: params.clinicaId,
        status: 'ativo',
        validadeCarteirinha: { not: null, lte: limite },
        ...escopoPaciente,
      },
      select: { nome: true },
      take: 4,
    });
    const total = await prisma.paciente.count({
      where: {
        clinicaId: params.clinicaId,
        status: 'ativo',
        validadeCarteirinha: { not: null, lte: limite },
        ...escopoPaciente,
      },
    });
    if (total > 0) {
      alertas.push({
        chave: 'carteirinhas',
        tipo: 'carteirinha',
        titulo: `${total} ${total === 1 ? 'carteirinha vence' : 'carteirinhas vencem'} nos próximos 6 meses`,
        descricao: carteirinhas.map((item) => item.nome).join(', '),
        href: '/pacientes',
        severidade: 'media',
      });
    }
  }

  return alertas;
}

export async function sincronizarOperacionais(params: {
  clinicaId: string;
  usuarioId: string;
  permissoes: unknown;
  isolarDados?: boolean;
  profissionalId?: string | null;
}) {
  const desejadas = await coletarAlertas(params);
  const chavesAtivas = desejadas.map((item) => item.chave);
  const chavesObsoletas = CHAVES_OPERACIONAIS.filter((chave) => !chavesAtivas.includes(chave));

  if (chavesObsoletas.length > 0) {
    await prisma.notificacao.deleteMany({
      where: {
        clinicaId: params.clinicaId,
        usuarioId: params.usuarioId,
        chave: { in: [...chavesObsoletas] },
      },
    });
  }

  for (const alerta of desejadas) {
    const existente = await prisma.notificacao.findUnique({
      where: {
        usuarioId_chave: { usuarioId: params.usuarioId, chave: alerta.chave },
        clinicaId: params.clinicaId,
      },
    });

    if (!existente) {
      await prisma.notificacao.create({
        data: {
          clinicaId: params.clinicaId,
          usuarioId: params.usuarioId,
          chave: alerta.chave,
          tipo: alerta.tipo,
          titulo: alerta.titulo,
          descricao: alerta.descricao,
          href: alerta.href,
          severidade: alerta.severidade,
        },
      });
      continue;
    }

    if (!existente.lidaEm) {
      await prisma.notificacao.update({
        where: { id: existente.id, clinicaId: params.clinicaId },
        data: {
          titulo: alerta.titulo,
          descricao: alerta.descricao,
          href: alerta.href,
          severidade: alerta.severidade,
        },
      });
    }
  }
}

export async function listarDoUsuario(usuarioId: string, clinicaId: string) {
  return prisma.notificacao.findMany({
    where: { usuarioId, clinicaId },
    orderBy: [{ lidaEm: 'asc' }, { criadoEm: 'desc' }],
    take: 30,
  });
}

export async function marcarLida(id: string, usuarioId: string, clinicaId: string) {
  const atual = await prisma.notificacao.findFirst({ where: { id, usuarioId, clinicaId } });
  if (!atual) return null;
  if (atual.lidaEm) return atual;
  return prisma.notificacao.update({
    where: { id, clinicaId },
    data: { lidaEm: new Date() },
  });
}

export async function marcarTodasLidas(usuarioId: string, clinicaId: string) {
  await prisma.notificacao.updateMany({
    where: { usuarioId, clinicaId, lidaEm: null },
    data: { lidaEm: new Date() },
  });
}

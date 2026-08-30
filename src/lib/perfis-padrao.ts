export interface AcoesModulo {
  visualizar: boolean;
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}

export type Permissoes = Record<string, AcoesModulo>;

const MODULOS = [
  'dashboard',
  'pacientes',
  'agenda',
  'profissionais',
  'financeiro',
  'convenios',
  'estoque',
  'relatorios',
  'configuracoes',
] as const;

type Modulo = (typeof MODULOS)[number];

function acoes(
  visualizar = false,
  criar = false,
  editar = false,
  excluir = false,
): AcoesModulo {
  return { visualizar, criar, editar, excluir };
}

function base(): Permissoes {
  const p = {} as Permissoes;
  for (const modulo of MODULOS) {
    p[modulo] = acoes(false, false, false, false);
  }
  return p;
}

function todasTrue(): Permissoes {
  const p = {} as Permissoes;
  for (const modulo of MODULOS) {
    p[modulo] = acoes(true, true, true, true);
  }
  return p;
}

function comModulos(
  overrides: Partial<Record<Modulo, AcoesModulo>>,
): Permissoes {
  const p = base();
  for (const [modulo, valor] of Object.entries(overrides)) {
    if (valor) {
      p[modulo] = valor;
    }
  }
  return p;
}

export interface PerfilPadrao {
  nome: string;
  descricao: string;
  permissoes: Permissoes;
}

const administrador: PerfilPadrao = {
  nome: 'Administrador',
  descricao: 'Acesso total ao sistema.',
  permissoes: todasTrue(),
};

const gestor: PerfilPadrao = {
  nome: 'Gestor',
  descricao: 'Gerencia operação da clínica, sem acesso a configurações.',
  permissoes: comModulos({
    dashboard: acoes(true),
    pacientes: acoes(true, true, true, false),
    agenda: acoes(true, true, true, true),
    profissionais: acoes(true, true, true, false),
    financeiro: acoes(true, true, true, false),
    convenios: acoes(true, true, true, false),
    estoque: acoes(true, true, true, false),
    relatorios: acoes(true, false, false, false),
    configuracoes: acoes(false, false, false, false),
  }),
};

const recepcao: PerfilPadrao = {
  nome: 'Recepção',
  descricao: 'Atendimento, agendamento e cadastro de pacientes.',
  permissoes: comModulos({
    dashboard: acoes(true),
    pacientes: acoes(true, true, true, false),
    agenda: acoes(true, true, true, false),
    profissionais: acoes(true, false, false, false),
    financeiro: acoes(true, true, false, false),
    convenios: acoes(true, false, false, false),
  }),
};

const profissionalSaude: PerfilPadrao = {
  nome: 'Profissional de saúde',
  descricao: 'Atendimento clínico e agenda.',
  permissoes: comModulos({
    dashboard: acoes(true),
    pacientes: acoes(true, false, true, false),
    agenda: acoes(true, true, true, false),
    convenios: acoes(true, false, false, false),
    estoque: acoes(true, false, false, false),
  }),
};

const financeiro: PerfilPadrao = {
  nome: 'Financeiro',
  descricao: 'Gestão financeira e convênios.',
  permissoes: comModulos({
    dashboard: acoes(true),
    pacientes: acoes(true, false, false, false),
    agenda: acoes(true, false, false, false),
    profissionais: acoes(true, false, false, false),
    financeiro: acoes(true, true, true, true),
    convenios: acoes(true, true, true, false),
    estoque: acoes(true, false, false, false),
    relatorios: acoes(true, false, false, false),
    configuracoes: acoes(false, false, false, false),
  }),
};

export const PERFIS_PADRAO: PerfilPadrao[] = [
  administrador,
  gestor,
  recepcao,
  profissionalSaude,
  financeiro,
];

export const NOME_PERFIL_ADMINISTRADOR = administrador.nome;

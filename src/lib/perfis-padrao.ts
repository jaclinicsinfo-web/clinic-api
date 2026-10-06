export interface AcoesModulo {
  visualizar: boolean;
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}

export type Permissoes = Record<string, AcoesModulo>;

export const MODULOS = [
  'dashboard',
  'pacientes',
  'agenda',
  'profissionais',
  'financeiro',
  'convenios',
  'estoque',
  'relatorios',
  'rh',
  'configuracoes',
  'integracoes',
  'powerbi',
  'agenteia',
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

export function todasTrue(): Permissoes {
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
  isolarDados: boolean;
  permissoes: Permissoes;
}

const administrador: PerfilPadrao = {
  nome: 'Administrador',
  descricao: 'Acesso total ao sistema.',
  isolarDados: false,
  permissoes: todasTrue(),
};

const gestor: PerfilPadrao = {
  nome: 'Gestor',
  descricao: 'Gerencia a operação da clínica e o perfil de outros usuários.',
  isolarDados: false,
  permissoes: comModulos({
    dashboard: acoes(true),
    pacientes: acoes(true, true, true, true),
    agenda: acoes(true, true, true, true),
    profissionais: acoes(true, true, true, true),
    financeiro: acoes(true, true, true, true),
    convenios: acoes(true, true, true, true),
    estoque: acoes(true, true, true, true),
    relatorios: acoes(true, false, false, false),
    rh: acoes(true, true, true, true),
    configuracoes: acoes(true, false, false, false),
    integracoes: acoes(true, true, true, true),
    powerbi: acoes(true),
    agenteia: acoes(true),
  }),
};

const recepcao: PerfilPadrao = {
  nome: 'Recepção',
  descricao: 'Atendimento, agendamento e cadastro de pacientes.',
  isolarDados: false,
  permissoes: comModulos({
    dashboard: acoes(true),
    pacientes: acoes(true, true, true, false),
    agenda: acoes(true, true, true, false),
    profissionais: acoes(true, false, false, false),
    financeiro: acoes(true, true, false, false),
    convenios: acoes(true, false, false, false),
    rh: acoes(true, true, false, false),
  }),
};

const profissionalSaude: PerfilPadrao = {
  nome: 'Profissional de saúde',
  descricao: 'Atendimento clínico e agenda. Vê apenas os próprios pacientes, a própria agenda e os próprios lançamentos.',
  isolarDados: true,
  permissoes: comModulos({
    dashboard: acoes(true),
    pacientes: acoes(true, false, true, false),
    agenda: acoes(true, true, true, false),
    convenios: acoes(true, false, false, false),
    estoque: acoes(true, false, false, false),
    rh: acoes(true, true, false, false),
  }),
};

const financeiro: PerfilPadrao = {
  nome: 'Financeiro',
  descricao: 'Gestão financeira e convênios.',
  isolarDados: false,
  permissoes: comModulos({
    dashboard: acoes(true),
    pacientes: acoes(true, false, false, false),
    agenda: acoes(true, false, false, false),
    profissionais: acoes(true, false, false, false),
    financeiro: acoes(true, true, true, true),
    convenios: acoes(true, true, true, true),
    estoque: acoes(true, false, false, false),
    relatorios: acoes(true, false, false, false),
    rh: acoes(true, true, false, false),
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
export const NOME_PERFIL_GESTOR = gestor.nome;
export const NOME_PERFIL_PROFISSIONAL_SAUDE = profissionalSaude.nome;

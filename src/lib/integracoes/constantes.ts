export const CANAIS_LEMBRETE = ['whatsapp', 'email'] as const;
export type CanalLembrete = (typeof CANAIS_LEMBRETE)[number];

export const TIPOS_LEMBRETE = [
  'antecedencia',
  'confirmacao',
  'reagendamento',
  'cancelamento',
] as const;
export type TipoLembrete = (typeof TIPOS_LEMBRETE)[number];

export const DESTINATARIOS_LEMBRETE = ['paciente', 'profissional', 'ambos'] as const;
export type DestinatarioLembrete = (typeof DESTINATARIOS_LEMBRETE)[number];

export const TIPOS_DESTINATARIO = ['paciente', 'profissional'] as const;
export type TipoDestinatario = (typeof TIPOS_DESTINATARIO)[number];

export const STATUS_ENVIO = [
  'pendente',
  'processando',
  'enviado',
  'entregue',
  'lido',
  'falhou',
  'cancelado',
] as const;
export type StatusEnvio = (typeof STATUS_ENVIO)[number];

export const CATEGORIAS_WHATSAPP = ['utility', 'marketing', 'authentication', 'service'] as const;
export type CategoriaWhatsapp = (typeof CATEGORIAS_WHATSAPP)[number];

export const STATUS_AGENDA_ATIVOS = ['agendado', 'confirmado', 'check_in', 'em_atendimento'] as const;

export const ORDEM_STATUS_ENVIO: Record<StatusEnvio, number> = {
  pendente: 0,
  processando: 1,
  enviado: 2,
  entregue: 3,
  lido: 4,
  falhou: 90,
  cancelado: 99,
};

export const CUSTOS_PADRAO: { canal: CanalLembrete; categoria: string }[] = [
  { canal: 'whatsapp', categoria: 'utility' },
  { canal: 'whatsapp', categoria: 'marketing' },
  { canal: 'whatsapp', categoria: 'authentication' },
  { canal: 'whatsapp', categoria: 'service' },
  { canal: 'email', categoria: 'padrao' },
];

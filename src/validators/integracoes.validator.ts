import { z } from 'zod';
import { textoOpcional } from './comum';
import {
  CANAIS_LEMBRETE,
  CATEGORIAS_WHATSAPP,
  DESTINATARIOS_LEMBRETE,
  STATUS_ENVIO,
  TIPOS_LEMBRETE,
} from '../lib/integracoes/constantes';

export const idParamSchema = z.object({
  id: z.string().uuid('Identificador inválido.'),
});

export const dashboardQuerySchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida.').optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida.').optional(),
  canal: z.enum(CANAIS_LEMBRETE).optional(),
  status: z.enum(STATUS_ENVIO).optional(),
  tipo: z.enum(TIPOS_LEMBRETE).optional(),
});

export const configuracaoBodySchema = z.object({
  lembretesAtivos: z.boolean().optional(),
  whatsappAtivo: z.boolean().optional(),
  whatsappPhoneNumberId: textoOpcional,
  whatsappWabaId: textoOpcional,
  whatsappAppId: textoOpcional,
  whatsappAccessToken: textoOpcional,
  whatsappAppSecret: textoOpcional,
  whatsappVerifyToken: textoOpcional,
  whatsappAmbiente: z.enum(['producao', 'sandbox']).optional(),
  emailAtivo: z.boolean().optional(),
  smtpHost: textoOpcional,
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUsuario: textoOpcional,
  smtpSenha: textoOpcional,
  smtpRemetente: textoOpcional,
  smtpRemetenteNome: textoOpcional,
  smtpSeguro: z.enum(['tls', 'ssl', 'none']).optional(),
});

export const testeWhatsappSchema = z.object({
  para: z.string().min(10, 'Informe um número de WhatsApp válido.'),
});

export const testeEmailSchema = z.object({
  para: z.string().email('Informe um e-mail válido.'),
});

export const regraBodySchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome da regra.'),
  tipo: z.enum(TIPOS_LEMBRETE),
  antecedenciaMinutos: z.number().int().min(1).max(60 * 24 * 14).optional().nullable(),
  destinatarios: z.enum(DESTINATARIOS_LEMBRETE),
  canais: z.array(z.enum(CANAIS_LEMBRETE)).min(1, 'Selecione ao menos um canal.'),
  templateWhatsappId: z.string().uuid().optional().nullable(),
  templateEmailId: z.string().uuid().optional().nullable(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().min(0).max(100).optional(),
}).superRefine((dados, ctx) => {
  if (dados.tipo === 'antecedencia' && !dados.antecedenciaMinutos) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe a antecedência em minutos.',
      path: ['antecedenciaMinutos'],
    });
  }
  if (dados.canais.includes('whatsapp') && !dados.templateWhatsappId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Selecione o template de WhatsApp.',
      path: ['templateWhatsappId'],
    });
  }
  if (dados.canais.includes('email') && !dados.templateEmailId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Selecione o template de e-mail.',
      path: ['templateEmailId'],
    });
  }
});

export const templateBodySchema = z.object({
  canal: z.enum(CANAIS_LEMBRETE),
  tipo: z.enum(TIPOS_LEMBRETE),
  nome: z.string().trim().min(3, 'Informe o nome do template.'),
  assunto: textoOpcional,
  corpo: z.string().trim().min(3, 'Informe o conteúdo da mensagem.'),
  whatsappNomeTemplate: textoOpcional,
  whatsappIdioma: z.string().trim().min(2).max(12).optional(),
  whatsappCategoria: z.enum(CATEGORIAS_WHATSAPP).optional(),
  ativo: z.boolean().optional(),
});

export const enviosQuerySchema = dashboardQuerySchema.extend({
  busca: z.string().optional(),
});

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { sincronizarCustosDaPlataforma } from './custo-envio.model';

const CORPO_LEMBRETE =
  'Olá {{paciente.nome}}, lembrete da sua consulta com {{profissional.nome}} em {{data}} às {{horario}} ({{procedimento}}) na unidade {{unidade}}.';
const CORPO_CONFIRMACAO =
  'Consulta confirmada: {{paciente.nome}} com {{profissional.nome}} em {{data}} às {{horario}} ({{procedimento}}) na unidade {{unidade}}.';
const CORPO_REAGENDAMENTO =
  'Sua consulta com {{profissional.nome}} foi reagendada para {{data}} às {{horario}} ({{procedimento}}) na unidade {{unidade}}.';
const CORPO_CANCELAMENTO =
  'A consulta de {{paciente.nome}} com {{profissional.nome}} em {{data}} às {{horario}} ({{procedimento}}) foi cancelada.';

export async function garantirPadrao(clinicaId: string) {
  const existente = await prisma.integracaoClinica.findUnique({ where: { clinicaId } });
  if (!existente) {
    await prisma.integracaoClinica.create({ data: { clinicaId } });
  }

  await sincronizarCustosDaPlataforma(clinicaId);

  const templates = await prisma.templateMensagem.count({ where: { clinicaId } });
  if (templates === 0) {
    const criados = await prisma.$transaction([
      prisma.templateMensagem.create({
        data: {
          clinicaId,
          canal: 'whatsapp',
          tipo: 'antecedencia',
          nome: 'Lembrete WhatsApp',
          corpo: CORPO_LEMBRETE,
          whatsappIdioma: 'pt_BR',
          whatsappCategoria: 'utility',
          sistema: true,
        },
      }),
      prisma.templateMensagem.create({
        data: {
          clinicaId,
          canal: 'email',
          tipo: 'antecedencia',
          nome: 'Lembrete por e-mail',
          assunto: 'Lembrete de consulta — {{data}} às {{horario}}',
          corpo: CORPO_LEMBRETE,
          sistema: true,
        },
      }),
      prisma.templateMensagem.create({
        data: {
          clinicaId,
          canal: 'whatsapp',
          tipo: 'confirmacao',
          nome: 'Confirmação WhatsApp',
          corpo: CORPO_CONFIRMACAO,
          whatsappIdioma: 'pt_BR',
          whatsappCategoria: 'utility',
          sistema: true,
        },
      }),
      prisma.templateMensagem.create({
        data: {
          clinicaId,
          canal: 'email',
          tipo: 'confirmacao',
          nome: 'Confirmação por e-mail',
          assunto: 'Consulta confirmada — {{data}} às {{horario}}',
          corpo: CORPO_CONFIRMACAO,
          sistema: true,
        },
      }),
      prisma.templateMensagem.create({
        data: {
          clinicaId,
          canal: 'whatsapp',
          tipo: 'reagendamento',
          nome: 'Reagendamento WhatsApp',
          corpo: CORPO_REAGENDAMENTO,
          whatsappIdioma: 'pt_BR',
          whatsappCategoria: 'utility',
          sistema: true,
        },
      }),
      prisma.templateMensagem.create({
        data: {
          clinicaId,
          canal: 'email',
          tipo: 'reagendamento',
          nome: 'Reagendamento por e-mail',
          assunto: 'Consulta reagendada — {{data}} às {{horario}}',
          corpo: CORPO_REAGENDAMENTO,
          sistema: true,
        },
      }),
      prisma.templateMensagem.create({
        data: {
          clinicaId,
          canal: 'whatsapp',
          tipo: 'cancelamento',
          nome: 'Cancelamento WhatsApp',
          corpo: CORPO_CANCELAMENTO,
          whatsappIdioma: 'pt_BR',
          whatsappCategoria: 'utility',
          sistema: true,
        },
      }),
      prisma.templateMensagem.create({
        data: {
          clinicaId,
          canal: 'email',
          tipo: 'cancelamento',
          nome: 'Cancelamento por e-mail',
          assunto: 'Consulta cancelada',
          corpo: CORPO_CANCELAMENTO,
          sistema: true,
        },
      }),
    ]);

    const porChave = (canal: string, tipo: string) =>
      criados.find((item) => item.canal === canal && item.tipo === tipo)?.id ?? null;

    await prisma.regraLembrete.createMany({
      data: [
        {
          clinicaId,
          nome: '24 horas antes',
          tipo: 'antecedencia',
          antecedenciaMinutos: 1440,
          destinatarios: 'paciente',
          canais: ['whatsapp', 'email'],
          templateWhatsappId: porChave('whatsapp', 'antecedencia'),
          templateEmailId: porChave('email', 'antecedencia'),
          ativo: true,
          sistema: true,
          ordem: 1,
        },
        {
          clinicaId,
          nome: '2 horas antes',
          tipo: 'antecedencia',
          antecedenciaMinutos: 120,
          destinatarios: 'paciente',
          canais: ['whatsapp'],
          templateWhatsappId: porChave('whatsapp', 'antecedencia'),
          templateEmailId: null,
          ativo: true,
          sistema: true,
          ordem: 2,
        },
        {
          clinicaId,
          nome: 'Confirmação para o paciente',
          tipo: 'confirmacao',
          destinatarios: 'paciente',
          canais: ['whatsapp', 'email'],
          templateWhatsappId: porChave('whatsapp', 'confirmacao'),
          templateEmailId: porChave('email', 'confirmacao'),
          ativo: true,
          sistema: true,
          ordem: 3,
        },
        {
          clinicaId,
          nome: 'Confirmação para o profissional',
          tipo: 'confirmacao',
          destinatarios: 'profissional',
          canais: ['email'],
          templateWhatsappId: null,
          templateEmailId: porChave('email', 'confirmacao'),
          ativo: false,
          sistema: true,
          ordem: 4,
        },
        {
          clinicaId,
          nome: 'Reagendamento',
          tipo: 'reagendamento',
          destinatarios: 'paciente',
          canais: ['whatsapp', 'email'],
          templateWhatsappId: porChave('whatsapp', 'reagendamento'),
          templateEmailId: porChave('email', 'reagendamento'),
          ativo: true,
          sistema: true,
          ordem: 5,
        },
        {
          clinicaId,
          nome: 'Cancelamento',
          tipo: 'cancelamento',
          destinatarios: 'paciente',
          canais: ['whatsapp', 'email'],
          templateWhatsappId: porChave('whatsapp', 'cancelamento'),
          templateEmailId: porChave('email', 'cancelamento'),
          ativo: true,
          sistema: true,
          ordem: 6,
        },
      ],
    });
  }

  return obterConfiguracao(clinicaId);
}

export async function obterConfiguracao(clinicaId: string) {
  return prisma.integracaoClinica.findUnique({ where: { clinicaId } });
}

export async function salvarConfiguracao(
  clinicaId: string,
  dados: Prisma.IntegracaoClinicaUpdateInput,
) {
  await garantirPadrao(clinicaId);
  return prisma.integracaoClinica.update({
    where: { clinicaId },
    data: dados,
  });
}

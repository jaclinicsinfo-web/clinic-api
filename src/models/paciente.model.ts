import { Prisma } from '@prisma/client';
import { prisma, type ClientePrisma } from '../config/database';

const incluirRelacoes = {
  convenio: { select: { id: true, nome: true, status: true } },
  profissionalPreferido: { select: { id: true, nome: true } },
} satisfies Prisma.PacienteInclude;

export type PacienteCompleto = Prisma.PacienteGetPayload<{
  include: typeof incluirRelacoes;
}>;

export interface FiltroListagemPacientes {
  clinicaId: string;
  profissionalId?: string;
}

export interface DadosPaciente {
  clinicaId: string;
  unidadeId: string;
  nome: string;
  cpf: string;
  rg: string | null;
  dataNascimento: Date;
  sexo: string;
  estadoCivil: string | null;
  profissao: string | null;
  telefone: string;
  whatsapp: string | null;
  email: string | null;
  cep: string;
  rua: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  convenioId: string | null;
  numeroCarteirinha: string | null;
  validadeCarteirinha: Date | null;
  responsavelNome: string | null;
  responsavelCpf: string | null;
  responsavelParentesco: string | null;
  responsavelTelefone: string | null;
  alergias: string[];
  condicoesPreexistentes: string[];
  medicacoesEmUso: string[];
  profissionalPreferidoId: string | null;
  formaContatoPreferida: string | null;
  observacoes: string | null;
  consentimentoLgpd: boolean;
  autorizacaoImagem: boolean;
  status?: string;
}

export async function listar(filtro: FiltroListagemPacientes): Promise<PacienteCompleto[]> {
  return prisma.paciente.findMany({
    where: {
      clinicaId: filtro.clinicaId,
      ...(filtro.profissionalId
        ? {
            OR: [
              { profissionalPreferidoId: filtro.profissionalId },
              { agendamentos: { some: { profissionalId: filtro.profissionalId } } },
            ],
          }
        : {}),
    },
    include: incluirRelacoes,
    orderBy: { nome: 'asc' },
  });
}

export async function listarResumoAgenda(clinicaId: string, profissionalId?: string) {
  return prisma.paciente.findMany({
    where: {
      clinicaId,
      status: { not: 'arquivado' },
      ...(profissionalId
        ? {
            OR: [
              { profissionalPreferidoId: profissionalId },
              { agendamentos: { some: { profissionalId } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      nome: true,
      telefone: true,
      cpf: true,
      dataNascimento: true,
      convenioId: true,
      alergias: true,
      status: true,
    },
    orderBy: { nome: 'asc' },
  });
}

export async function buscarPorIdEClinica(
  id: string,
  clinicaId: string,
): Promise<PacienteCompleto | null> {
  return prisma.paciente.findFirst({
    where: { id, clinicaId },
    include: incluirRelacoes,
  });
}

export async function cpfJaExiste(
  clinicaId: string,
  cpf: string,
  excetoId?: string,
): Promise<boolean> {
  const existente = await prisma.paciente.findFirst({
    where: {
      clinicaId,
      cpf,
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

export async function criar(
  dados: DadosPaciente,
  tx: ClientePrisma = prisma,
): Promise<PacienteCompleto> {
  return tx.paciente.create({
    data: {
      clinicaId: dados.clinicaId,
      unidadeId: dados.unidadeId,
      nome: dados.nome,
      cpf: dados.cpf,
      rg: dados.rg,
      dataNascimento: dados.dataNascimento,
      sexo: dados.sexo,
      estadoCivil: dados.estadoCivil,
      profissao: dados.profissao,
      telefone: dados.telefone,
      whatsapp: dados.whatsapp,
      email: dados.email,
      cep: dados.cep,
      rua: dados.rua,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      cidade: dados.cidade,
      uf: dados.uf,
      convenioId: dados.convenioId,
      numeroCarteirinha: dados.numeroCarteirinha,
      validadeCarteirinha: dados.validadeCarteirinha,
      responsavelNome: dados.responsavelNome,
      responsavelCpf: dados.responsavelCpf,
      responsavelParentesco: dados.responsavelParentesco,
      responsavelTelefone: dados.responsavelTelefone,
      alergias: dados.alergias,
      condicoesPreexistentes: dados.condicoesPreexistentes,
      medicacoesEmUso: dados.medicacoesEmUso,
      profissionalPreferidoId: dados.profissionalPreferidoId,
      formaContatoPreferida: dados.formaContatoPreferida,
      observacoes: dados.observacoes,
      consentimentoLgpd: dados.consentimentoLgpd,
      autorizacaoImagem: dados.autorizacaoImagem,
      status: dados.status ?? 'ativo',
    },
    include: incluirRelacoes,
  });
}

export async function atualizar(
  id: string,
  clinicaId: string,
  dados: Omit<DadosPaciente, 'clinicaId' | 'unidadeId' | 'status'> & { status?: string },
): Promise<PacienteCompleto> {
  return prisma.paciente.update({
    where: { id, clinicaId },
    data: {
      nome: dados.nome,
      cpf: dados.cpf,
      rg: dados.rg,
      dataNascimento: dados.dataNascimento,
      sexo: dados.sexo,
      estadoCivil: dados.estadoCivil,
      profissao: dados.profissao,
      telefone: dados.telefone,
      whatsapp: dados.whatsapp,
      email: dados.email,
      cep: dados.cep,
      rua: dados.rua,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      cidade: dados.cidade,
      uf: dados.uf,
      convenioId: dados.convenioId,
      numeroCarteirinha: dados.numeroCarteirinha,
      validadeCarteirinha: dados.validadeCarteirinha,
      responsavelNome: dados.responsavelNome,
      responsavelCpf: dados.responsavelCpf,
      responsavelParentesco: dados.responsavelParentesco,
      responsavelTelefone: dados.responsavelTelefone,
      alergias: dados.alergias,
      condicoesPreexistentes: dados.condicoesPreexistentes,
      medicacoesEmUso: dados.medicacoesEmUso,
      profissionalPreferidoId: dados.profissionalPreferidoId,
      formaContatoPreferida: dados.formaContatoPreferida,
      observacoes: dados.observacoes,
      consentimentoLgpd: dados.consentimentoLgpd,
      autorizacaoImagem: dados.autorizacaoImagem,
      ...(dados.status ? { status: dados.status } : {}),
    },
    include: incluirRelacoes,
  });
}

export async function alterarStatus(
  id: string,
  clinicaId: string,
  status: string,
): Promise<PacienteCompleto> {
  return prisma.paciente.update({
    where: { id, clinicaId },
    data: { status },
    include: incluirRelacoes,
  });
}

import { Unidade } from '@prisma/client';
import { ClinicaCadastro } from '../models/clinica.model';
import { unidadeResumo } from './auth.view';

export function clinicaCompleta(clinica: ClinicaCadastro) {
  return {
    id: clinica.id,
    nomeFantasia: clinica.nomeFantasia,
    razaoSocial: clinica.razaoSocial,
    cnpj: clinica.cnpj,
    telefone: clinica.telefone,
    email: clinica.email,
    endereco: {
      cep: clinica.cep ?? '',
      rua: clinica.rua ?? '',
      numero: clinica.numero ?? '',
      complemento: clinica.complemento ?? '',
      bairro: clinica.bairro ?? '',
      cidade: clinica.cidade ?? '',
      uf: clinica.uf ?? '',
    },
    temLogo: Boolean(clinica.logoMime),
    unidades: clinica.unidades.map(unidadeCadastro),
  };
}

export function unidadeCadastro(unidade: Unidade) {
  return {
    id: unidade.id,
    nome: unidade.nome,
    cidade: unidade.cidade,
    ativo: unidade.ativo,
  };
}

export function montarClinica(clinica: ClinicaCadastro) {
  return { clinica: clinicaCompleta(clinica) };
}

export function montarUnidadeMutacao(params: {
  unidade: Unidade;
  unidadesSessao: Unidade[];
}) {
  return {
    unidade: unidadeCadastro(params.unidade),
    unidadesSessao: params.unidadesSessao.filter((item) => item.ativo).map(unidadeResumo),
  };
}

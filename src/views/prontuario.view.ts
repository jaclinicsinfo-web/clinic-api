import { AcompanhamentoCompleto, AtendimentoCompleto } from '../models/prontuario.model';
import { dataCivil } from '../lib/datas';

export function acompanhamentoResumo(item: AcompanhamentoCompleto) {
  return {
    id: item.id,
    pacienteId: item.pacienteId,
    profissionalId: item.profissionalId,
    profissionalNome: item.profissional.nome,
    especialidade: item.especialidade,
    titulo: item.titulo,
    queixaInicial: item.queixaInicial,
    quadroInicial: item.quadroInicial,
    objetivo: item.objetivo,
    status: item.status,
    inicioEm: dataCivil(item.inicioEm) ?? '',
    altaEm: dataCivil(item.altaEm),
    resumoAlta: item.resumoAlta,
  };
}

export function atendimentoResumo(item: AtendimentoCompleto, pacienteId: string) {
  return {
    id: item.id,
    agendamentoId: item.agendamentoId ?? '',
    pacienteId,
    profissionalId: item.profissionalId,
    profissionalNome: item.profissional.nome,
    data: dataCivil(item.data) ?? '',
    procedimentoRealizado: item.procedimentoRealizado,
    evolucao: item.evolucao,
    anexos: item.anexos.map((anexo) => ({
      id: anexo.id,
      nome: anexo.nome,
      tipo: anexo.tipo,
      tamanhoKb: anexo.tamanhoKb,
      url: `/pacientes/${pacienteId}/documentos/${anexo.id}/arquivo`,
      criadoEm: anexo.criadoEm.toISOString(),
      origem: anexo.origem,
    })),
    proximoRetornoSugerido: dataCivil(item.proximoRetornoSugerido),
    criadoEm: item.criadoEm.toISOString(),
    acompanhamentoId: item.acompanhamentoId,
    tipoRegistro: item.tipoRegistro,
    queixaPrincipal: item.queixaPrincipal,
    quadroClinico: item.quadroClinico,
    conduta: item.conduta,
    respostaAoTratamento: item.respostaAoTratamento,
    escalaDor: item.escalaDor,
  };
}

export function documentoResumo(
  documento: {
    id: string;
    nome: string;
    tipo: string;
    origem: string;
    tamanhoKb: number;
    criadoEm: Date;
  },
  pacienteId: string,
) {
  return {
    id: documento.id,
    nome: documento.nome,
    tipo: documento.tipo,
    tamanhoKb: documento.tamanhoKb,
    url: `/pacientes/${pacienteId}/documentos/${documento.id}/arquivo`,
    criadoEm: documento.criadoEm.toISOString(),
    origem: documento.origem,
  };
}

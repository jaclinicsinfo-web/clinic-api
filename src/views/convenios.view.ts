import { ConvenioCompleto } from '../models/convenio.model';
import { dinheiro } from '../lib/datas';

export function convenioResumo(convenio: { id: string; nome: string }) {
  return { id: convenio.id, nome: convenio.nome };
}

export function convenioCompleto(convenio: ConvenioCompleto) {
  return {
    id: convenio.id,
    nome: convenio.nome,
    registroAns: convenio.registroAns,
    prazoPagamentoDias: convenio.prazoPagamentoDias,
    exigeAutorizacaoPrevia: convenio.exigeAutorizacaoPrevia,
    contatoNome: convenio.contatoNome,
    contatoTelefone: convenio.contatoTelefone,
    portalUrl: convenio.portalUrl,
    tabelaPrecos: convenio.tabelaPrecos.map((item) => ({
      procedimentoId: item.procedimentoId,
      valor: dinheiro(item.valor),
    })),
    status: convenio.status,
  };
}

export function montarListaConvenios(convenios: ConvenioCompleto[]) {
  const ativos = convenios.filter((item) => item.status === 'ativo');
  return {
    convenios: convenios.map(convenioCompleto),
    resumo: {
      total: convenios.length,
      ativos: ativos.length,
      exigemAutorizacao: convenios.filter((item) => item.exigeAutorizacaoPrevia).length,
      prazoMedio:
        convenios.length === 0
          ? 0
          : Math.round(
              convenios.reduce((total, item) => total + item.prazoPagamentoDias, 0) / convenios.length,
            ),
    },
  };
}

export function montarConvenio(convenio: ConvenioCompleto) {
  return { convenio: convenioCompleto(convenio) };
}

export function montarDetalheConvenio(params: {
  convenio: ConvenioCompleto;
  indicadores: {
    pacientesVinculados: number;
    atendimentosMes: number;
    faturamentoMes: number;
    taxaGlosa: number;
  };
  pacientes: { id: string; nome: string; numeroCarteirinha: string | null; status: string }[];
  procedimentos: {
    id: string;
    nome: string;
    categoria: string;
    duracaoPadraoMin: number;
    valorParticular: number;
    status: string;
  }[];
}) {
  return {
    convenio: convenioCompleto(params.convenio),
    indicadores: params.indicadores,
    pacientes: params.pacientes,
    procedimentos: params.procedimentos,
  };
}

import { dataCivil } from '../lib/datas';
import { formatarDuracao, minutosTrabalhados, statusDoPonto } from '../lib/rh';
import {
  HoleriteCompleto,
  RegistroPontoCompleto,
  UsuarioRh,
} from '../models/rh.model';

function usuarioResumo(usuario: UsuarioRh | RegistroPontoCompleto['usuario'] | HoleriteCompleto['usuario']) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    status: usuario.status as 'ativo' | 'inativo',
    perfilNome: 'perfilNome' in usuario ? usuario.perfilNome : usuario.perfil.nome,
  };
}

export function registroPontoResumo(registro: RegistroPontoCompleto) {
  const horarios = {
    entrada: registro.entrada,
    saidaIntervalo: registro.saidaIntervalo,
    retornoIntervalo: registro.retornoIntervalo,
    saida: registro.saida,
  };
  const minutos = minutosTrabalhados(horarios);

  return {
    id: registro.id,
    usuarioId: registro.usuarioId,
    usuarioNome: registro.usuario.nome,
    usuarioEmail: registro.usuario.email,
    perfilNome: registro.usuario.perfil.nome,
    data: dataCivil(registro.data) ?? '',
    entrada: registro.entrada,
    saidaIntervalo: registro.saidaIntervalo,
    retornoIntervalo: registro.retornoIntervalo,
    saida: registro.saida,
    observacao: registro.observacao,
    origem: registro.origem as 'manual' | 'proprio',
    status: statusDoPonto(horarios),
    minutosTrabalhados: minutos,
    horasTrabalhadas: formatarDuracao(minutos),
    registradoPorNome: registro.registradoPor.nome,
    atualizadoEm: registro.atualizadoEm.toISOString(),
  };
}

export function holeriteResumo(holerite: HoleriteCompleto) {
  return {
    id: holerite.id,
    usuarioId: holerite.usuarioId,
    usuarioNome: holerite.usuario.nome,
    usuarioEmail: holerite.usuario.email,
    perfilNome: holerite.usuario.perfil.nome,
    competencia: holerite.competencia,
    nomeArquivo: holerite.nomeArquivo,
    mimeType: holerite.mimeType,
    tamanhoKb: holerite.tamanhoKb,
    criadoPorNome: holerite.criadoPor.nome,
    criadoEm: holerite.criadoEm.toISOString(),
  };
}

export function montarVisaoRh(params: {
  usuarios: UsuarioRh[];
  registrosHoje: RegistroPontoCompleto[];
  holerites: HoleriteCompleto[];
  competencia: string;
  hoje: string;
  somenteProprios: boolean;
}) {
  const ativos = params.usuarios.filter((usuario) => usuario.status === 'ativo');
  const presentesIds = new Set(
    params.registrosHoje.filter((item) => item.entrada).map((item) => item.usuarioId),
  );
  const incompletos = params.registrosHoje.filter((item) => !item.saida && item.entrada).length;
  const holeritesDaCompetencia = params.holerites.filter((item) => item.competencia === params.competencia);
  const comHolerite = new Set(holeritesDaCompetencia.map((item) => item.usuarioId));

  return {
    competencia: params.competencia,
    hoje: params.hoje,
    somenteProprios: params.somenteProprios,
    resumo: {
      usuariosAtivos: ativos.length,
      presentesHoje: presentesIds.size,
      ausentesHoje: Math.max(ativos.length - presentesIds.size, 0),
      incompletosHoje: incompletos,
      holeritesCompetencia: holeritesDaCompetencia.length,
      semHolerite: Math.max(ativos.length - comHolerite.size, 0),
    },
    pontoHoje: params.registrosHoje.map(registroPontoResumo),
    holeritesRecentes: params.holerites.slice(0, 8).map(holeriteResumo),
    usuarios: params.usuarios.map(usuarioResumo),
  };
}

export function montarListaPonto(params: {
  registros: RegistroPontoCompleto[];
  usuarios: UsuarioRh[];
  inicio: string;
  fim: string;
  hoje: string;
  somenteProprios: boolean;
}) {
  const registros = params.registros.map(registroPontoResumo);
  const ativos = params.usuarios.filter((usuario) => usuario.status === 'ativo');
  const doDia = registros.filter((item) => item.data === params.hoje);
  const presentes = new Set(doDia.filter((item) => item.entrada).map((item) => item.usuarioId));

  return {
    inicio: params.inicio,
    fim: params.fim,
    hoje: params.hoje,
    somenteProprios: params.somenteProprios,
    registros,
    usuarios: params.usuarios.map(usuarioResumo),
    resumo: {
      registros: registros.length,
      completos: registros.filter((item) => item.status === 'completo').length,
      emAndamento: registros.filter((item) => item.status === 'em_andamento').length,
      presentesHoje: presentes.size,
      ausentesHoje: Math.max(ativos.length - presentes.size, 0),
      minutosTrabalhados: registros.reduce((total, item) => total + (item.minutosTrabalhados ?? 0), 0),
    },
  };
}

export function montarRegistroPonto(registro: RegistroPontoCompleto) {
  return { registro: registroPontoResumo(registro) };
}

export function montarListaHolerites(params: {
  holerites: HoleriteCompleto[];
  usuarios: UsuarioRh[];
  competencias: string[];
  competencia: string;
  somenteProprios: boolean;
}) {
  const holerites = params.holerites.map(holeriteResumo);
  const daCompetencia = holerites.filter((item) => item.competencia === params.competencia);
  const comHolerite = new Set(daCompetencia.map((item) => item.usuarioId));
  const ativos = params.usuarios.filter((usuario) => usuario.status === 'ativo');

  return {
    competencia: params.competencia,
    competencias: params.competencias,
    somenteProprios: params.somenteProprios,
    holerites,
    usuarios: params.usuarios.map(usuarioResumo),
    resumo: {
      enviados: daCompetencia.length,
      semHolerite: Math.max(ativos.length - comHolerite.size, 0),
      usuariosAtivos: ativos.length,
    },
  };
}

export function montarHolerite(holerite: HoleriteCompleto) {
  return { holerite: holeriteResumo(holerite) };
}

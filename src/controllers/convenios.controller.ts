import { Request, Response, NextFunction } from 'express';
import {
  convenioBodySchema,
  convenioIdParamSchema,
  convenioTabelaSchema,
} from '../validators/convenios.validator';
import {
  alterarStatus,
  atualizar,
  buscarPorIdEClinica,
  criar,
  indicadoresDoMes,
  listarPacientesVinculados,
  listarPorClinica,
  nomeJaExiste,
  substituirTabelaPrecos,
} from '../models/convenio.model';
import { idsPertencemAClinica, listarAtivosPorClinica } from '../models/procedimento.model';
import { AppError } from '../lib/erros';
import { dinheiro } from '../lib/datas';
import { montarConvenio, montarDetalheConvenio, montarListaConvenios } from '../views/convenios.view';

function inicioFimMesAtual() {
  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0));
  return { inicio, fim };
}

async function carregarConvenio(req: Request) {
  const { id } = convenioIdParamSchema.parse(req.params);
  const convenio = await buscarPorIdEClinica(id, req.auth!.clinicaId);
  if (!convenio) {
    throw new AppError(404, 'Convênio não encontrado.');
  }
  return convenio;
}

export async function listarConvenios(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const convenios = await listarPorClinica(req.auth!.clinicaId);
    res.json(montarListaConvenios(convenios));
  } catch (err) {
    next(err);
  }
}

export async function obterConvenio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const convenio = await carregarConvenio(req);
    const clinicaId = req.auth!.clinicaId;
    const { inicio, fim } = inicioFimMesAtual();
    const [indicadores, pacientes, procedimentos] = await Promise.all([
      indicadoresDoMes(convenio.id, clinicaId, inicio, fim),
      listarPacientesVinculados(convenio.id, clinicaId),
      listarAtivosPorClinica(clinicaId),
    ]);

    res.json(
      montarDetalheConvenio({
        convenio,
        indicadores,
        pacientes,
        procedimentos: procedimentos.map((item) => ({
          id: item.id,
          nome: item.nome,
          categoria: item.categoria,
          duracaoPadraoMin: item.duracaoPadraoMin,
          valorParticular: dinheiro(item.valorParticular),
          status: item.status,
        })),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function criarConvenio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = convenioBodySchema.parse(req.body);

    if (await nomeJaExiste(clinicaId, dados.nome)) {
      throw new AppError(409, 'Já existe um convênio com este nome.');
    }

    const criado = await criar({
      clinicaId,
      nome: dados.nome,
      registroAns: dados.registroAns,
      prazoPagamentoDias: dados.prazoPagamentoDias,
      exigeAutorizacaoPrevia: dados.exigeAutorizacaoPrevia,
      contatoNome: dados.contatoNome,
      contatoTelefone: dados.contatoTelefone,
      portalUrl: dados.portalUrl,
      status: dados.status,
    });
    res.status(201).json(montarConvenio(criado));
  } catch (err) {
    next(err);
  }
}

export async function atualizarConvenio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const convenio = await carregarConvenio(req);
    const dados = convenioBodySchema.parse(req.body);

    if (await nomeJaExiste(convenio.clinicaId, dados.nome, convenio.id)) {
      throw new AppError(409, 'Já existe um convênio com este nome.');
    }

    const atualizado = await atualizar(convenio.id, {
      nome: dados.nome,
      registroAns: dados.registroAns,
      prazoPagamentoDias: dados.prazoPagamentoDias,
      exigeAutorizacaoPrevia: dados.exigeAutorizacaoPrevia,
      contatoNome: dados.contatoNome,
      contatoTelefone: dados.contatoTelefone,
      portalUrl: dados.portalUrl,
      status: dados.status,
    });
    res.json(montarConvenio(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function inativarConvenio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const convenio = await carregarConvenio(req);
    if (convenio.status === 'inativo') {
      res.json(montarConvenio(convenio));
      return;
    }
    const atualizado = await alterarStatus(convenio.id, 'inativo');
    res.json(montarConvenio(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function salvarTabelaConvenio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const convenio = await carregarConvenio(req);
    const { precos } = convenioTabelaSchema.parse(req.body);
    const filtrados = precos.filter((item) => item.valor > 0);
    const ids = filtrados.map((item) => item.procedimentoId);

    if (!(await idsPertencemAClinica(ids, convenio.clinicaId))) {
      throw new AppError(400, 'Um ou mais procedimentos não pertencem a esta clínica.');
    }

    const atualizado = await substituirTabelaPrecos(convenio.id, filtrados);
    res.json(montarConvenio(atualizado));
  } catch (err) {
    next(err);
  }
}

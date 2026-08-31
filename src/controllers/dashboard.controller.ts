import { Request, Response, NextFunction } from 'express';
import { carregarContextoClinico } from '../lib/escopo';
import { temPermissao } from '../lib/permissoes';
import { carregarPainel, painelVazio } from '../models/dashboard.model';
import { montarDashboard } from '../views/dashboard.view';

export async function obterDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { usuario, somenteProprios, profissionalIdEscopo } = await carregarContextoClinico(req);
    const incluirFinanceiro = temPermissao(usuario.perfil.permissoes, 'financeiro', 'visualizar');

    if (somenteProprios && !profissionalIdEscopo) {
      res.json(montarDashboard(painelVazio(), incluirFinanceiro));
      return;
    }

    const painel = await carregarPainel({
      clinicaId: usuario.clinicaId,
      profissionalId: profissionalIdEscopo,
      incluirFinanceiro,
      permissoes: usuario.perfil.permissoes,
    });

    res.json(montarDashboard(painel, incluirFinanceiro));
  } catch (err) {
    next(err);
  }
}

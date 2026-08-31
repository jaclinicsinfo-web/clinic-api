import { Request, Response, NextFunction } from 'express';
import { relatorioQuerySchema } from '../validators/relatorios.validator';
import { carregarRelatorios, relatoriosVazio } from '../models/relatorios.model';
import { montarRelatorios } from '../views/relatorios.view';
import { carregarContextoClinico } from '../lib/escopo';

export async function obterRelatorios(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { periodo } = relatorioQuerySchema.parse(req.query);
    const { somenteProprios, profissionalIdEscopo } = await carregarContextoClinico(req);

    if (somenteProprios && !profissionalIdEscopo) {
      res.json(montarRelatorios(relatoriosVazio(periodo)));
      return;
    }

    const painel = await carregarRelatorios({
      clinicaId: req.auth!.clinicaId,
      periodo,
      profissionalId: profissionalIdEscopo,
    });

    res.json(montarRelatorios(painel));
  } catch (err) {
    next(err);
  }
}

import { Request, Response } from 'express';
import { montarHealth } from '../views/health.view';

export function health(_req: Request, res: Response): void {
  res.json(montarHealth());
}

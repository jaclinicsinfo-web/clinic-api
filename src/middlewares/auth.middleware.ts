import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { verificarToken } from '../lib/jwt';
import { AppError } from '../lib/erros';
import { contextoTenant } from '../lib/tenant';
import { bloqueioDeCobranca } from '../lib/assinatura';

async function garantirClinicaAtiva(clinicaId: string): Promise<void> {
  const clinica = await prisma.clinica.findUnique({
    where: { id: clinicaId },
    select: { status: true, tipoAcesso: true, trialExpiraEm: true, pagoAte: true },
  });

  if (!clinica) {
    throw new AppError(401, 'Não encontramos esse usuário.');
  }

  if (clinica.status !== 'ativa') {
    throw new AppError(403, 'Esta clínica está desativada.');
  }

  const bloqueio = bloqueioDeCobranca(clinica);
  if (bloqueio) {
    throw new AppError(403, bloqueio.mensagem, { codigo: bloqueio.codigo });
  }
}

export function autenticar(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError(401, 'Sessão expirada. Entre novamente.'));
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    req.auth = verificarToken(token);
    contextoTenant.run({ clinicaId: req.auth.clinicaId, modoSistema: false }, () => {
      void garantirClinicaAtiva(req.auth!.clinicaId).then(() => next()).catch(next);
    });
  } catch {
    next(new AppError(401, 'Sessão expirada. Entre novamente.'));
  }
}

import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/erros';

const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const uploadDocumento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!MIME_PERMITIDOS.has(file.mimetype)) {
      cb(new Error('Envie um arquivo PDF, JPG ou PNG.'));
      return;
    }
    cb(null, true);
  },
}).single('arquivo');

export function tratarUpload(req: Request, res: Response, next: NextFunction): void {
  uploadDocumento(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(400, 'O arquivo deve ter no máximo 10 MB.'));
      return;
    }
    if (err instanceof Error) {
      next(new AppError(400, err.message));
      return;
    }
    next(err);
  });
}

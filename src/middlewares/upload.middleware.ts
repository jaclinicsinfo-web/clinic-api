import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/erros';

const MIME_DOCUMENTO = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MIME_LOGO = new Set(['image/jpeg', 'image/png', 'image/webp']);

function criarUpload(mimes: Set<string>, maxBytes: number, mensagemTipo: string, mensagemTamanho: string) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      if (!mimes.has(file.mimetype)) {
        cb(new Error(mensagemTipo));
        return;
      }
      cb(null, true);
    },
  }).single('arquivo');

  return (req: Request, res: Response, next: NextFunction): void => {
    upload(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(400, mensagemTamanho));
        return;
      }
      if (err instanceof Error) {
        next(new AppError(400, err.message));
        return;
      }
      next(err);
    });
  };
}

export const tratarUpload = criarUpload(
  MIME_DOCUMENTO,
  10 * 1024 * 1024,
  'Envie um arquivo PDF, JPG ou PNG.',
  'O arquivo deve ter no máximo 10 MB.',
);

export const tratarUploadLogo = criarUpload(
  MIME_LOGO,
  2 * 1024 * 1024,
  'Envie um arquivo JPG, PNG ou WebP.',
  'A logo deve ter no máximo 2 MB.',
);

import { PayloadToken } from '../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      auth?: PayloadToken;
      rawBody?: Buffer;
    }
  }
}

export {};

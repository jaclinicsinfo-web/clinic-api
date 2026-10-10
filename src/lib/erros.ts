export class AppError extends Error {
  public readonly status: number;
  /** Campos extras devolvidos junto com `message` (ex.: código do bloqueio). */
  public readonly extras?: Record<string, unknown>;

  constructor(status: number, mensagem: string, extras?: Record<string, unknown>) {
    super(mensagem);
    this.name = 'AppError';
    this.status = status;
    this.extras = extras;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

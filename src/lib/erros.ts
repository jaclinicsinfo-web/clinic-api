export class AppError extends Error {
  public readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'AppError';
    this.status = status;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

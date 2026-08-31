import { z } from 'zod';

export const textoOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((valor) => {
    if (valor == null) return null;
    const texto = valor.trim();
    return texto.length > 0 ? texto : null;
  });

export const dataCivilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .refine((valor) => {
    const data = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
  }, 'Data inválida.');

export const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.');

export const uuidOpcional = z
  .union([z.string().uuid('Identificador inválido.'), z.null(), z.literal('')])
  .optional()
  .transform((valor) => (valor ? valor : null));

export const statusCadastroSchema = z.enum(['ativo', 'inativo'], {
  errorMap: () => ({ message: 'Status inválido.' }),
});

import { z } from 'zod';
import { MODULOS } from '../lib/perfis-padrao';

export const perfilIdParamSchema = z.object({
  id: z.string().uuid('Perfil inválido.'),
});

export const atualizarPermissoesSchema = z.object({
  permissoes: z
    .array(
      z.object({
        modulo: z
          .string()
          .refine((valor): valor is (typeof MODULOS)[number] => (MODULOS as readonly string[]).includes(valor), {
            message: 'Módulo inválido.',
          }),
        visualizar: z.boolean(),
        criar: z.boolean(),
        editar: z.boolean(),
        excluir: z.boolean(),
      }),
    )
    .min(1, 'Informe as permissões do perfil.'),
  isolarDados: z.boolean(),
});

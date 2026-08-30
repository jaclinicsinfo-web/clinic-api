import { z } from 'zod';

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(3, 'Nome deve ter no mínimo 3 caracteres.'),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  senha: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
  perfilId: z.string().uuid('Perfil inválido.'),
  unidadesIds: z
    .array(z.string().uuid('Unidade inválida.'))
    .min(1, 'Selecione ao menos uma unidade.'),
});

export const usuarioIdParamSchema = z.object({
  id: z.string().uuid('Usuário inválido.'),
});

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;

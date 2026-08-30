import { Plano } from '@prisma/client';

export function montarListaPlanos(planos: Plano[]) {
  return {
    planos: planos.map((plano) => ({
      codigo: plano.codigo,
      nome: plano.nome,
      limiteUsuarios: plano.limiteUsuarios,
    })),
  };
}

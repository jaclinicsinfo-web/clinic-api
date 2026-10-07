import { Plano } from '@prisma/client';
import { limiteUnidadesDoPlano, modulosDoPlano } from '../lib/modulos-plano';

export function montarListaPlanos(planos: Plano[]) {
  return {
    planos: planos.map((plano) => ({
      codigo: plano.codigo,
      nome: plano.nome,
      limiteUsuarios: plano.limiteUsuarios,
      precoMensal: Number(plano.precoMensal),
      limiteUnidades: limiteUnidadesDoPlano(plano.codigo),
      modulos: [...modulosDoPlano(plano.codigo)],
    })),
  };
}

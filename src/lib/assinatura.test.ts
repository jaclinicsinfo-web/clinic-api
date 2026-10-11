import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bloqueioDeCobranca,
  calcularTrocaDePlano,
  inicioDoNovoPeriodo,
  resumoAssinatura,
  somarCiclo,
  subtrairCiclo,
  valorMensalDe,
  type EntradaTroca,
} from './assinatura';

const dia = 24 * 60 * 60 * 1000;
const agora = new Date('2026-10-10T15:00:00.000Z');

/** trialExpiraEm é lido como relógio de São Paulo gravado sem fuso. */
function relogioSp(instante: Date): Date {
  return new Date(instante.getTime() - 3 * 60 * 60 * 1000);
}

describe('somarCiclo', () => {
  it('soma um mês mantendo o dia', () => {
    assert.equal(somarCiclo(new Date('2026-10-10T15:00:00.000Z'), 'mensal').toISOString(), '2026-11-10T15:00:00.000Z');
  });

  it('encosta no último dia quando o mês seguinte é mais curto', () => {
    assert.equal(somarCiclo(new Date('2026-01-31T12:00:00.000Z'), 'mensal').toISOString(), '2026-02-28T12:00:00.000Z');
  });

  it('soma doze meses no anual', () => {
    assert.equal(somarCiclo(new Date('2026-10-10T15:00:00.000Z'), 'anual').toISOString(), '2027-10-10T15:00:00.000Z');
  });

  it('subtrai um ciclo encostando no último dia', () => {
    assert.equal(subtrairCiclo(new Date('2026-03-31T12:00:00.000Z'), 'mensal').toISOString(), '2026-02-28T12:00:00.000Z');
    assert.equal(subtrairCiclo(new Date('2027-10-10T15:00:00.000Z'), 'anual').toISOString(), '2026-10-10T15:00:00.000Z');
  });
});

describe('inicioDoNovoPeriodo', () => {
  it('mantém o que sobra do teste', () => {
    const fimTeste = new Date(agora.getTime() + 3 * dia);
    const inicio = inicioDoNovoPeriodo(
      { tipoAcesso: 'gratuito', trialExpiraEm: relogioSp(fimTeste), pagoAte: null },
      agora,
    );
    assert.equal(inicio.toISOString(), fimTeste.toISOString());
  });

  it('começa agora quando o teste já acabou', () => {
    const inicio = inicioDoNovoPeriodo(
      { tipoAcesso: 'gratuito', trialExpiraEm: relogioSp(new Date(agora.getTime() - dia)), pagoAte: null },
      agora,
    );
    assert.equal(inicio.toISOString(), agora.toISOString());
  });

  it('pagamento adiantado estende a partir do vencimento', () => {
    const pagoAte = new Date(agora.getTime() + 10 * dia);
    assert.equal(
      inicioDoNovoPeriodo({ tipoAcesso: 'pago', trialExpiraEm: null, pagoAte }, agora).toISOString(),
      pagoAte.toISOString(),
    );
  });

  it('pagamento na carência mantém a data de vencimento', () => {
    const pagoAte = new Date(agora.getTime() - 3 * dia);
    assert.equal(
      inicioDoNovoPeriodo({ tipoAcesso: 'pago', trialExpiraEm: null, pagoAte }, agora).toISOString(),
      pagoAte.toISOString(),
    );
  });

  it('clínica bloqueada recomeça agora', () => {
    const pagoAte = new Date(agora.getTime() - 30 * dia);
    assert.equal(
      inicioDoNovoPeriodo({ tipoAcesso: 'pago', trialExpiraEm: null, pagoAte }, agora).toISOString(),
      agora.toISOString(),
    );
  });
});

describe('resumoAssinatura e bloqueio', () => {
  it('sem vencimento é cobrança manual e nunca bloqueia', () => {
    const clinica = { tipoAcesso: 'pago', trialExpiraEm: null, pagoAte: null };
    assert.equal(resumoAssinatura(clinica, agora).situacao, 'manual');
    assert.equal(bloqueioDeCobranca(clinica, agora), null);
  });

  it('em dia antes do vencimento', () => {
    const clinica = { tipoAcesso: 'pago', trialExpiraEm: null, pagoAte: new Date(agora.getTime() + dia) };
    assert.equal(resumoAssinatura(clinica, agora).situacao, 'em_dia');
    assert.equal(bloqueioDeCobranca(clinica, agora), null);
  });

  it('atrasada durante os 5 dias de carência, sem bloquear', () => {
    const clinica = { tipoAcesso: 'pago', trialExpiraEm: null, pagoAte: new Date(agora.getTime() - 4 * dia) };
    const resumo = resumoAssinatura(clinica, agora);
    assert.equal(resumo.situacao, 'atrasada');
    assert.equal(resumo.bloqueiaEm, new Date(agora.getTime() + dia).toISOString());
    assert.equal(bloqueioDeCobranca(clinica, agora), null);
  });

  it('bloqueia depois da carência', () => {
    const clinica = { tipoAcesso: 'pago', trialExpiraEm: null, pagoAte: new Date(agora.getTime() - 5 * dia) };
    assert.equal(resumoAssinatura(clinica, agora).situacao, 'bloqueada');
    assert.equal(bloqueioDeCobranca(clinica, agora)?.codigo, 'ASSINATURA_VENCIDA');
  });

  it('teste encerrado bloqueia com o código próprio', () => {
    const clinica = {
      tipoAcesso: 'gratuito',
      trialExpiraEm: relogioSp(new Date(Date.now() - dia)),
      pagoAte: null,
    };
    assert.equal(bloqueioDeCobranca(clinica)?.codigo, 'TESTE_ENCERRADO');
  });
});

describe('calcularTrocaDePlano', () => {
  const essencial = { codigo: 'essencial', precoMensal: 199.9, precoAnual: 2398.8 };
  const profissional = { codigo: 'profissional', precoMensal: 319.9, precoAnual: 3838.8 };
  const ilimitado = { codigo: 'ilimitado', precoMensal: 499.9, precoAnual: 5998.8 };

  /** Mensal pago de `inicio` a `pagoAte`, no plano Profissional, trocando para o Ilimitado. */
  function entrada(parcial: Partial<EntradaTroca> & { pagoAte?: Date; inicio?: Date }): EntradaTroca {
    const { pagoAte: vence, inicio, ...resto } = parcial;
    const pagoAte = vence ?? new Date('2026-10-20T15:00:00.000Z');
    return {
      clinica: { tipoAcesso: 'pago', trialExpiraEm: null, pagoAte },
      planoAtual: profissional,
      cicloAtual: 'mensal',
      planoNovo: ilimitado,
      cicloNovo: 'mensal',
      periodoInicio: inicio ?? new Date('2026-09-20T15:00:00.000Z'),
      agora,
      ...resto,
    };
  }

  it('upgrade cobra a diferença dos dias que faltam e mantém o vencimento', () => {
    // 20/09 → 20/10 = 30 dias; faltam 10 → (499,90 − 319,90) × 10/30 = 60,00
    assert.deepEqual(calcularTrocaDePlano(entrada({})), { tipo: 'upgrade', valor: 60, mantemVencimento: true });
  });

  it('downgrade não cobra e fica para o vencimento', () => {
    const pagoAte = new Date('2026-10-20T15:00:00.000Z');
    assert.deepEqual(calcularTrocaDePlano(entrada({ planoNovo: essencial, pagoAte })), {
      tipo: 'downgrade_agendado',
      aPartirDe: pagoAte,
    });
  });

  it('mensal → anual: o que sobra vira crédito e o anual vale 12 meses a partir de hoje', () => {
    // Exemplo do plano: Profissional mensal, faltam 10 de 30 dias → crédito 106,63; anual 3.838,80 sai por 3.732,17.
    const resultado = calcularTrocaDePlano(entrada({ planoNovo: profissional, cicloNovo: 'anual' }));
    assert.equal(resultado.tipo, 'troca_ciclo');
    if (resultado.tipo !== 'troca_ciclo') return;
    assert.equal(resultado.credito, 106.63);
    assert.equal(resultado.valor, 3732.17);
    assert.equal(resultado.novoInicio.toISOString(), agora.toISOString());
    assert.equal(resultado.novoFim.toISOString(), '2027-10-10T15:00:00.000Z');
  });

  it('anual → mensal com crédito maior que o mês fica para o vencimento', () => {
    const pagoAte = new Date('2027-04-10T15:00:00.000Z');
    const resultado = calcularTrocaDePlano(
      entrada({
        cicloAtual: 'anual',
        planoNovo: profissional,
        cicloNovo: 'mensal',
        pagoAte,
        inicio: new Date('2026-04-10T15:00:00.000Z'),
      }),
    );
    assert.deepEqual(resultado, { tipo: 'downgrade_agendado', aPartirDe: pagoAte });
  });

  it('diferença abaixo de R$ 5,00 troca sem cobrança', () => {
    // Falta 1 dia de 30: (499,90 − 319,90) / 30 = 6,00 → cobra; Essencial → Profissional: 120 / 30 = 4,00 → não cobra.
    const pagoAte = new Date('2026-10-11T15:00:00.000Z');
    const inicio = new Date('2026-09-11T15:00:00.000Z');
    assert.deepEqual(calcularTrocaDePlano(entrada({ pagoAte, inicio })), { tipo: 'upgrade', valor: 6, mantemVencimento: true });
    assert.deepEqual(
      calcularTrocaDePlano(entrada({ pagoAte, inicio, planoAtual: essencial, planoNovo: profissional })),
      { tipo: 'sem_custo' },
    );
  });

  it('no último dia do período o upgrade sai sem custo', () => {
    // Vence hoje à noite: ainda em dia, mas não falta nenhum dia inteiro.
    const pagoAte = new Date('2026-10-10T23:00:00.000Z');
    const resultado = calcularTrocaDePlano(entrada({ pagoAte, inicio: new Date('2026-09-10T23:00:00.000Z') }));
    assert.deepEqual(resultado, { tipo: 'sem_custo' });
  });

  it('fevereiro (28 dias) e meses de 31 dias contam os dias reais', () => {
    const fevereiro = calcularTrocaDePlano(
      entrada({
        pagoAte: new Date('2027-03-10T15:00:00.000Z'),
        inicio: new Date('2027-02-10T15:00:00.000Z'),
        agora: new Date('2027-02-24T15:00:00.000Z'),
      }),
    );
    // 14 de 28 dias: 180 × 0,5 = 90,00
    assert.deepEqual(fevereiro, { tipo: 'upgrade', valor: 90, mantemVencimento: true });

    const outubro = calcularTrocaDePlano(
      entrada({
        pagoAte: new Date('2026-11-10T15:00:00.000Z'),
        inicio: new Date('2026-10-10T15:00:00.000Z'),
        agora: new Date('2026-10-25T15:00:00.000Z'),
      }),
    );
    // 16 de 31 dias: 180 × 16/31 = 92,90
    assert.deepEqual(outubro, { tipo: 'upgrade', valor: 92.9, mantemVencimento: true });
  });

  it('sem pedido do período usa o vencimento menos um ciclo', () => {
    assert.deepEqual(calcularTrocaDePlano({ ...entrada({}), periodoInicio: null }), {
      tipo: 'upgrade',
      valor: 60,
      mantemVencimento: true,
    });
  });

  it('atrasada, bloqueada ou em teste paga o período cheio', () => {
    const atrasada = entrada({ pagoAte: new Date(agora.getTime() - 2 * dia) });
    assert.deepEqual(calcularTrocaDePlano(atrasada), { tipo: 'periodo_cheio', valor: 499.9 });
    const teste: EntradaTroca = {
      ...entrada({}),
      clinica: { tipoAcesso: 'gratuito', trialExpiraEm: relogioSp(new Date(agora.getTime() + 3 * dia)), pagoAte: null },
      cicloNovo: 'anual',
    };
    assert.deepEqual(calcularTrocaDePlano(teste), { tipo: 'periodo_cheio', valor: 5998.8 });
  });

  it('mesmo plano e ciclo é renovação', () => {
    assert.deepEqual(calcularTrocaDePlano(entrada({ planoNovo: profissional })), { tipo: 'renovacao', valor: 319.9 });
  });
});

describe('valorMensalDe', () => {
  it('anual vira o preço anual dividido por 12', () => {
    assert.equal(valorMensalDe({ codigo: 'p', precoMensal: 319.9, precoAnual: 3838.8 }, 'anual'), 319.9);
    assert.equal(valorMensalDe({ codigo: 'p', precoMensal: 319.9, precoAnual: 3000 }, 'anual'), 250);
    assert.equal(valorMensalDe({ codigo: 'p', precoMensal: 319.9, precoAnual: 3000 }, 'mensal'), 319.9);
  });
});

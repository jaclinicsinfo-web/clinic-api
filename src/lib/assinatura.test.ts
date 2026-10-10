import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bloqueioDeCobranca,
  inicioDoNovoPeriodo,
  resumoAssinatura,
  somarCiclo,
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

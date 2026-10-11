import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { marcoDeCobranca } from '../assinatura';
import { MAX_TENTATIVAS, proximaTentativa } from '../email/fila';
import { montarEmailLembrete, montarEmailRecibo, prazoRelativo } from '../email/templates/cobranca';
import { dentroDaJanela } from './lembretes';

const DIA = 24 * 60 * 60 * 1000;
// 10/10/2026 12:00 em São Paulo
const agora = new Date('2026-10-10T15:00:00.000Z');
const pago = (pagoAte: Date, ciclo = 'mensal') => ({ status: 'ativa', tipoAcesso: 'pago', trialExpiraEm: null, pagoAte, cicloCobranca: ciclo });
/** trialExpiraEm é o relógio de São Paulo gravado sem fuso. */
const relogioSp = (instante: Date) => new Date(instante.getTime() - 3 * 60 * 60 * 1000);

describe('marcoDeCobranca', () => {
  it('sem marco longe do vencimento', () => {
    assert.equal(marcoDeCobranca(pago(new Date(agora.getTime() + 20 * DIA)), agora), null);
  });

  it('anual avisa 30 dias antes; mensal não', () => {
    const vence = new Date(agora.getTime() + 30 * DIA);
    assert.equal(marcoDeCobranca(pago(vence, 'anual'), agora)?.marco, 'D-30');
    assert.equal(marcoDeCobranca(pago(vence, 'mensal'), agora), null);
  });

  it('segue o calendário D-5, D-1, D0, D+1, D+3', () => {
    const casos: [number, string][] = [[5, 'D-5'], [4, 'D-5'], [1, 'D-1'], [0, 'D0'], [-1, 'D+1'], [-2, 'D+1'], [-3, 'D+3'], [-4, 'D+3']];
    for (const [dias, esperado] of casos) {
      const vence = new Date(agora.getTime() + dias * DIA);
      assert.equal(marcoDeCobranca(pago(vence), agora)?.marco, esperado, `${dias} dias`);
    }
  });

  it('cobrança automática: um aviso 3 dias antes e os de atraso continuam', () => {
    const auto = (dias: number) => ({ ...pago(new Date(agora.getTime() + dias * DIA)), automatica: true });
    assert.equal(marcoDeCobranca(auto(5), agora), null);
    assert.equal(marcoDeCobranca(auto(3), agora)?.marco, 'auto-3');
    assert.equal(marcoDeCobranca(auto(1), agora)?.marco, 'auto-3');
    assert.equal(marcoDeCobranca(auto(0), agora), null);
    assert.equal(marcoDeCobranca(auto(-1), agora)?.marco, 'D+1');
    assert.equal(marcoDeCobranca({ ...pago(new Date(agora.getTime() + 30 * DIA), 'anual'), automatica: true }, agora), null);
  });

  it('não manda marco velho quando o servidor ficou fora do ar', () => {
    // D-5 alcançado há 3 dias e D-1 ainda não: nada (o D-1 vem no dia certo).
    assert.equal(marcoDeCobranca(pago(new Date(agora.getTime() + 2 * DIA)), agora), null);
  });

  it('D+5 no bloqueio e para de avisar depois de 2 dias', () => {
    assert.equal(marcoDeCobranca(pago(new Date(agora.getTime() - 5 * DIA - 60_000)), agora)?.marco, 'D+5');
    assert.equal(marcoDeCobranca(pago(new Date(agora.getTime() - 8 * DIA)), agora), null);
  });

  it('cobrança manual (sem vencimento) e clínica desativada nunca recebem', () => {
    assert.equal(marcoDeCobranca({ status: 'ativa', tipoAcesso: 'pago', trialExpiraEm: null, pagoAte: null }, agora), null);
    assert.equal(marcoDeCobranca({ ...pago(agora), status: 'desativada' }, agora), null);
  });

  it('teste grátis: 2 dias antes e no fim', () => {
    const doisDias = { status: 'ativa', tipoAcesso: 'gratuito', pagoAte: null, trialExpiraEm: relogioSp(new Date(agora.getTime() + 2 * DIA)) };
    assert.equal(marcoDeCobranca(doisDias, agora)?.marco, 'teste-2');
    const acabou = { ...doisDias, trialExpiraEm: relogioSp(new Date(agora.getTime() - 60_000)) };
    assert.equal(marcoDeCobranca(acabou, agora)?.marco, 'teste-fim');
    const longe = { ...doisDias, trialExpiraEm: relogioSp(new Date(agora.getTime() + 5 * DIA)) };
    assert.equal(marcoDeCobranca(longe, agora), null);
  });

  it('a referência é o vencimento: muda quando a clínica paga', () => {
    const vence = new Date(agora.getTime() + DIA);
    assert.equal(marcoDeCobranca(pago(vence), agora)?.referencia.getTime(), vence.getTime());
  });
});

describe('fila de e-mails', () => {
  it('espera cada vez mais e desiste depois da última tentativa', () => {
    const esperas = [1, 2, 3, 4, 5, 6].map((n) => (proximaTentativa(n, agora)!.getTime() - agora.getTime()) / 60_000);
    assert.deepEqual(esperas, [1, 5, 15, 60, 360, 1440]);
    assert.equal(proximaTentativa(MAX_TENTATIVAS, agora), null);
  });
});

describe('textos', () => {
  it('prazo em dias de calendário de São Paulo', () => {
    assert.equal(prazoRelativo(new Date('2026-10-10T23:30:00.000Z'), agora), 'hoje'); // 20h30 em SP
    assert.equal(prazoRelativo(new Date('2026-10-11T03:30:00.000Z'), agora), 'amanhã'); // 00h30 do dia 11 em SP
    assert.equal(prazoRelativo(new Date(agora.getTime() + 5 * DIA), agora), 'em 5 dias');
    assert.equal(prazoRelativo(new Date(agora.getTime() - 2 * DIA), agora), 'há 2 dias');
  });

  it('lembrete e recibo mostram valor, datas e o link', () => {
    const lembrete = montarEmailLembrete({
      marco: 'D+3', clinica: 'Clínica X', nomeAdmin: 'Ana Souza', plano: 'Profissional', ciclo: 'mensal', valor: 319.9,
      vence: new Date(agora.getTime() - 3 * DIA), bloqueia: new Date(agora.getTime() + 2 * DIA), link: 'https://app/configuracoes/assinatura', agora,
    });
    assert.match(lembrete.assunto, /Último aviso/);
    assert.match(lembrete.texto, /R\$\s?319,90/);
    assert.match(lembrete.html, /configuracoes\/assinatura/);

    const recibo = montarEmailRecibo({
      clinica: 'Clínica X', plano: 'Essencial', ciclo: 'anual', valor: 2878.8, meio: 'cartao_credito', parcelas: 12,
      periodoInicio: agora, periodoFim: new Date(agora.getTime() + 365 * DIA), pagamentoId: '123', link: 'https://app/login',
    });
    assert.match(recibo.texto, /12x/);
    assert.match(recibo.texto, /123/);
  });

  it('janela de envio em horário de São Paulo', () => {
    assert.equal(dentroDaJanela(new Date('2026-10-10T15:00:00.000Z'), { inicio: 8, fim: 20 }), true); // 12h
    assert.equal(dentroDaJanela(new Date('2026-10-10T02:00:00.000Z'), { inicio: 8, fim: 20 }), false); // 23h
  });
});

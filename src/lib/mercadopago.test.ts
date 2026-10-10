import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { assinaturaWebhookValida, meiosDePagamento, valorConfere } from './mercadopago';

const segredo = 'segredo-de-teste';

function assinar(manifesto: string, ts = '1704908010') {
  const v1 = createHmac('sha256', segredo).update(manifesto).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('assinaturaWebhookValida', () => {
  it('aceita o x-signature calculado com o manifesto do Mercado Pago', () => {
    const assinatura = assinar('id:123456;request-id:req-1;ts:1704908010;');
    assert.equal(
      assinaturaWebhookValida({ assinatura, requestId: 'req-1', dataId: '123456', segredo }),
      true,
    );
  });

  it('usa o data.id alfanumérico em minúsculas', () => {
    const assinatura = assinar('id:abc123;request-id:req-1;ts:1704908010;');
    assert.equal(
      assinaturaWebhookValida({ assinatura, requestId: 'req-1', dataId: 'ABC123', segredo }),
      true,
    );
  });

  it('tira do manifesto o que não veio no aviso', () => {
    const assinatura = assinar('id:123456;ts:1704908010;');
    assert.equal(
      assinaturaWebhookValida({ assinatura, requestId: undefined, dataId: '123456', segredo }),
      true,
    );
  });

  it('recusa id trocado, segredo errado ou cabeçalho ausente', () => {
    const assinatura = assinar('id:123456;request-id:req-1;ts:1704908010;');
    assert.equal(assinaturaWebhookValida({ assinatura, requestId: 'req-1', dataId: '999', segredo }), false);
    assert.equal(
      assinaturaWebhookValida({ assinatura, requestId: 'req-1', dataId: '123456', segredo: 'outro' }),
      false,
    );
    assert.equal(assinaturaWebhookValida({ assinatura: undefined, requestId: 'req-1', dataId: '123456', segredo }), false);
    assert.equal(assinaturaWebhookValida({ assinatura: 'ts=1,v1=curto', requestId: 'req-1', dataId: '123456', segredo }), false);
  });
});

describe('meiosDePagamento', () => {
  it('mensal só à vista', () => {
    const meios = meiosDePagamento('mensal');
    assert.equal(meios.installments, 1);
  });

  it('anual libera o parcelamento no cartão', () => {
    const meios = meiosDePagamento('anual');
    assert.equal(meios.installments, 12);
    assert.equal('default_installments' in meios, false);
  });
});

describe('valorConfere', () => {
  it('tolera só arredondamento de centavo', () => {
    assert.equal(valorConfere(349, 349.01), true);
    assert.equal(valorConfere(349, 348.5), false);
  });
});

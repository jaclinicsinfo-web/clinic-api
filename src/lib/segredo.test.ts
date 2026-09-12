import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cifrarSegredo, decifrarSegredo, ehValorMascarado, mascararSegredo } from './segredo';

describe('segredo', () => {
  it('cifra e decifra um token sem expor o valor original', () => {
    const original = 'EAAG-token-super-secreto';
    const cifrado = cifrarSegredo(original);
    assert.notEqual(cifrado, original);
    assert.equal(decifrarSegredo(cifrado), original);
  });

  it('mascara valores e reconhece máscara da interface', () => {
    assert.equal(ehValorMascarado('••••••••'), true);
    assert.equal(ehValorMascarado(''), true);
    assert.equal(ehValorMascarado('EAAG1234novo'), false);
    const mascarado = mascararSegredo('1234567890abcd');
    assert.ok(mascarado?.includes('•'));
    assert.notEqual(mascarado, '1234567890abcd');
  });

  it('não quebra ao decifrar payload inválido', () => {
    assert.equal(decifrarSegredo('nao-e-base64-valido'), null);
  });
});

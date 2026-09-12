import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import crypto from 'crypto';
import {
  agendamentoPermiteAntecedencia,
  calcularProcessarEm,
  chaveIdempotencia,
  destinatariosDaRegra,
  emailValido,
  instanteAgendamento,
  normalizarTelefoneWhatsapp,
  podeAvancarStatus,
  statusWhatsappParaEnvio,
} from './regras';
import { interpolarTexto, parametrosWhatsapp } from './placeholders';
import { custoDaPlataforma, custosDaPlataforma } from './custos-plataforma';
import { validarAssinaturaWebhook } from './whatsapp-meta';

const contexto = {
  pacienteNome: 'Ana Silva',
  profissionalNome: 'Dr. João',
  data: '12/09/2026',
  horario: '14:00',
  procedimento: 'Avaliação',
  unidade: 'Centro',
  sala: '2',
  clinicaNome: 'Clínica Exemplo',
  tipoAtendimento: 'Avaliação',
};

describe('motor de lembretes', () => {
  it('gera chave de idempotência estável para o mesmo agendamento/regra/destinatário/canal', () => {
    const a = chaveIdempotencia({
      agendamentoId: 'ag-1',
      regraId: 'regra-24h',
      destinatarioTipo: 'paciente',
      canal: 'whatsapp',
      tipo: 'antecedencia',
    });
    const b = chaveIdempotencia({
      agendamentoId: 'ag-1',
      regraId: 'regra-24h',
      destinatarioTipo: 'paciente',
      canal: 'whatsapp',
      tipo: 'antecedencia',
    });
    assert.equal(a, b);
  });

  it('diferencia reagendamentos pela referência do novo horário', () => {
    const primeiro = chaveIdempotencia({
      agendamentoId: 'ag-1',
      regraId: 'regra-re',
      destinatarioTipo: 'paciente',
      canal: 'email',
      tipo: 'reagendamento',
      referenciaEvento: '2026-09-12-14:00',
    });
    const segundo = chaveIdempotencia({
      agendamentoId: 'ag-1',
      regraId: 'regra-re',
      destinatarioTipo: 'paciente',
      canal: 'email',
      tipo: 'reagendamento',
      referenciaEvento: '2026-09-13-09:00',
    });
    assert.notEqual(primeiro, segundo);
  });

  it('expande destinatários da regra', () => {
    assert.deepEqual(destinatariosDaRegra('ambos'), ['paciente', 'profissional']);
    assert.deepEqual(destinatariosDaRegra('paciente'), ['paciente']);
  });

  it('não agenda antecedência para consulta cancelada ou já iniciada', () => {
    const futuro = new Date('2099-01-01T00:00:00.000Z');
    assert.equal(agendamentoPermiteAntecedencia('cancelado', futuro, '10:00'), false);
    assert.equal(agendamentoPermiteAntecedencia('agendado', new Date('2000-01-01T00:00:00.000Z'), '08:00'), false);
    assert.equal(agendamentoPermiteAntecedencia('agendado', futuro, '10:00'), true);
  });

  it('calcula o horário de envio com antecedência e não agenda no passado', () => {
    const agora = instanteAgendamento(new Date('2026-09-12T00:00:00.000Z'), '10:00');
    const processar = calcularProcessarEm({
      tipo: 'antecedencia',
      data: new Date('2026-09-12T00:00:00.000Z'),
      horaInicio: '14:00',
      antecedenciaMinutos: 120,
      agora,
    });
    assert.equal(processar.toISOString(), instanteAgendamento(new Date('2026-09-12T00:00:00.000Z'), '12:00').toISOString());

    const atrasado = calcularProcessarEm({
      tipo: 'antecedencia',
      data: new Date('2026-09-12T00:00:00.000Z'),
      horaInicio: '14:00',
      antecedenciaMinutos: 1440,
      agora,
    });
    assert.equal(atrasado.toISOString(), agora.toISOString());
  });

  it('interpola templates com dados do agendamento', () => {
    const texto = interpolarTexto(
      'Olá {{paciente.nome}}, consulta com {{profissional.nome}} em {{data}} às {{horario}}.',
      contexto,
    );
    assert.equal(texto, 'Olá Ana Silva, consulta com Dr. João em 12/09/2026 às 14:00.');
    assert.deepEqual(parametrosWhatsapp('{{paciente.nome}} {{data}} {{horario}}', contexto), [
      'Ana Silva',
      '12/09/2026',
      '14:00',
    ]);
  });

  it('normaliza telefone e e-mail e rejeita contato ausente', () => {
    assert.equal(normalizarTelefoneWhatsapp('(16) 99999-1111'), '5516999991111');
    assert.equal(normalizarTelefoneWhatsapp(null), null);
    assert.equal(emailValido('  ANA@CLINICA.COM  '), 'ana@clinica.com');
    assert.equal(emailValido(''), null);
  });

  it('avança status do envio sem regressão e mapeia webhook da Meta', () => {
    assert.equal(podeAvancarStatus('enviado', 'entregue'), true);
    assert.equal(podeAvancarStatus('entregue', 'enviado'), false);
    assert.equal(statusWhatsappParaEnvio('delivered'), 'entregue');
    assert.equal(statusWhatsappParaEnvio('failed'), 'falhou');
  });

  it('rejeita webhook com assinatura inválida', () => {
    const secret = 'app-secret-teste';
    const corpo = Buffer.from('{"object":"whatsapp_business_account"}');
    const valida = `sha256=${crypto.createHmac('sha256', secret).update(corpo).digest('hex')}`;
    assert.equal(validarAssinaturaWebhook({ appSecret: secret, assinatura: valida, corpoBruto: corpo }), true);
    assert.equal(
      validarAssinaturaWebhook({ appSecret: secret, assinatura: 'sha256=00', corpoBruto: corpo }),
      false,
    );
    assert.equal(validarAssinaturaWebhook({ appSecret: secret, assinatura: undefined, corpoBruto: corpo }), false);
  });

  it('usa a tabela de custos da plataforma, não um valor editável pela clínica', () => {
    const tabela = custosDaPlataforma();
    assert.ok(tabela.some((item) => item.canal === 'whatsapp' && item.categoria === 'utility'));
    assert.ok(tabela.some((item) => item.canal === 'email' && item.categoria === 'padrao'));
    assert.equal(custoDaPlataforma('email'), custoDaPlataforma('email', 'padrao'));
    assert.equal(custoDaPlataforma('whatsapp'), custoDaPlataforma('whatsapp', 'utility'));
    for (const item of tabela) {
      assert.ok(item.valor >= 0);
    }
  });
});

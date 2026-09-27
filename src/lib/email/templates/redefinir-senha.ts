import { hospedeDoLink, primeiroNome } from '../html';
import { montarHtmlTransacional, montarTextoTransacional, type BlocoEmail } from '../layout';

export interface DadosEmailRedefinirSenha {
  nome: string;
  empresa: string;
  email?: string;
  link: string;
  validadeMinutos?: number;
}

export function montarEmailRedefinirSenha(dados: DadosEmailRedefinirSenha) {
  const validade = dados.validadeMinutos ?? 60;
  const nome = primeiroNome(dados.nome);
  const empresa = dados.empresa.trim();
  const conta = dados.email?.trim();
  const hospede = hospedeDoLink(dados.link);

  const sistema = 'J.A. Clinics';
  const bloco: BlocoEmail = {
    marca: sistema,
    organizacao: empresa,
    preheader: `Pedido de nova senha no ${sistema} para ${empresa}. O link vale por ${validade} minutos.`,
    titulo: 'Pedido de nova senha',
    paragrafos: [
      `Olá, ${nome}.`,
      conta
        ? `Recebemos um pedido para criar uma nova senha da conta ${conta} no ${sistema}, o sistema usado pela organização ${empresa}.`
        : `Recebemos um pedido para criar uma nova senha da sua conta no ${sistema}, o sistema usado pela organização ${empresa}.`,
      hospede
        ? `Se foi você, continue no endereço ${hospede} e escolha a nova senha. O acesso expira em ${validade} minutos e só pode ser usado uma vez.`
        : `Se foi você, continue pelo botão abaixo e escolha a nova senha. O acesso expira em ${validade} minutos e só pode ser usado uma vez.`,
    ],
    botao: {
      rotulo: 'Definir nova senha',
      url: dados.link,
    },
    aviso:
      'Se você não fez este pedido, ignore o e-mail. Ninguém altera a senha sem este link, e a senha atual continua valendo.',
  };

  return {
    assunto: `Pedido de nova senha — ${empresa}`,
    remetenteNome: `${sistema} · ${empresa}`,
    texto: montarTextoTransacional(bloco),
    html: montarHtmlTransacional(bloco),
  };
}

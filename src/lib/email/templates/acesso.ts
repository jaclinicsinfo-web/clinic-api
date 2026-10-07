import { primeiroNome } from '../html';
import { montarHtmlTransacional, montarTextoTransacional, type BlocoEmail } from '../layout';

export interface DadosEmailAcesso {
  nome: string;
  empresa: string;
  email: string;
  senha: string;
  link: string;
  plano: string;
  gratuitoAte?: string | null;
}

export function montarEmailAcesso(dados: DadosEmailAcesso) {
  const nome = primeiroNome(dados.nome);
  const sistema = 'J.A. Clinics';
  const gratuito = dados.gratuitoAte
    ? `Seu acesso gratuito ao plano ${dados.plano} vale até ${dados.gratuitoAte}.`
    : `Sua assinatura do plano ${dados.plano} já está ativa.`;

  const bloco: BlocoEmail = {
    marca: sistema,
    organizacao: dados.empresa,
    preheader: `O acesso de ${dados.empresa} ao ${sistema} está pronto.`,
    titulo: 'Seu acesso está pronto',
    paragrafos: [
      `Olá, ${nome}.`,
      `A clínica ${dados.empresa} já pode entrar no ${sistema}. ${gratuito}`,
      `Entre com o e-mail ${dados.email} e a senha temporária ${dados.senha}. Troque a senha depois do primeiro acesso.`,
    ],
    botao: {
      rotulo: 'Entrar no sistema',
      url: dados.link,
    },
    aviso: 'Guarde este e-mail. A senha temporária não aparece em nenhum outro lugar.',
  };

  return {
    assunto: `Acesso da ${dados.empresa} — ${sistema}`,
    remetenteNome: sistema,
    texto: montarTextoTransacional(bloco),
    html: montarHtmlTransacional(bloco),
  };
}

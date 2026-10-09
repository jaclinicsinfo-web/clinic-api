import { escaparHtml } from './html';

const MARCA = 'J.A. Clinics';
const COR_FUNDO = '#f6f7f9';
const COR_TEXTO = '#0f1a24';
const COR_MUDO = '#5c6b7a';
const COR_BORDA = '#e2e6ec';
const COR_CABECALHO = '#0c3f4a';
const COR_BOTAO = '#0d5c6b';
const COR_BOTAO_TEXTO = '#ffffff';

export interface BlocoEmail {
  preheader: string;
  titulo: string;
  paragrafos: string[];
  marca?: string;
  organizacao?: string;
  botao?: { rotulo: string; url: string };
  linkExtra?: { rotulo: string; url: string };
  aviso?: string;
}

function marcaDe(bloco: BlocoEmail): string {
  return bloco.marca?.trim() || MARCA;
}

function organizacaoDe(bloco: BlocoEmail): string {
  return bloco.organizacao?.trim() || '';
}

export function montarHtmlTransacional(bloco: BlocoEmail): string {
  const marca = escaparHtml(marcaDe(bloco));
  const organizacao = escaparHtml(organizacaoDe(bloco));
  const linhaOrganizacao = organizacao
    ? `<p style="margin:6px 0 0;font-size:13px;line-height:1.4;font-weight:500;color:#d7e4e8;">${organizacao}</p>`
    : '';
  const rodapeOrganizacao = organizacao
    ? `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${COR_MUDO};">${organizacao}</p>`
    : '';
  const preheader = escaparHtml(bloco.preheader);
  const titulo = escaparHtml(bloco.titulo);
  const paragrafos = bloco.paragrafos.map((texto) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COR_TEXTO};">${escaparHtml(texto)}</p>`).join('');
  const linkExtra = bloco.linkExtra
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COR_TEXTO};"><a href="${escaparHtml(bloco.linkExtra.url)}" target="_blank" rel="noopener noreferrer" style="color:${COR_BOTAO};font-weight:600;">${escaparHtml(bloco.linkExtra.rotulo)}</a></p>`
    : '';
  const aviso = bloco.aviso
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${COR_MUDO};">${escaparHtml(bloco.aviso)}</p>`
    : '';

  const botao = bloco.botao
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;">
        <tr>
          <td align="center" bgcolor="${COR_BOTAO}" style="border-radius:8px;">
            <a href="${escaparHtml(bloco.botao.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;line-height:1;color:${COR_BOTAO_TEXTO};text-decoration:none;">${escaparHtml(bloco.botao.rotulo)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${COR_MUDO};">Se o botão não funcionar, copie e cole este link no navegador:<br /><a href="${escaparHtml(bloco.botao.url)}" style="color:${COR_BOTAO};word-break:break-all;">${escaparHtml(bloco.botao.url)}</a></p>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <title>${titulo}</title>
  </head>
  <body style="margin:0;padding:0;background:${COR_FUNDO};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${COR_FUNDO};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:20px 28px;background:${COR_CABECALHO};border-radius:12px 12px 0 0;">
                <p style="margin:0;font-size:18px;font-weight:600;letter-spacing:-0.02em;color:#ffffff;">${marca}</p>
                ${linhaOrganizacao}
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;background:#ffffff;border:1px solid ${COR_BORDA};border-top:0;border-radius:0 0 12px 12px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:${COR_TEXTO};">${titulo}</h1>
                ${paragrafos}
                ${botao}
                ${linkExtra}
                ${aviso}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 8px 0;text-align:center;">
                <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${COR_MUDO};">${marca}</p>
                ${rodapeOrganizacao}
                <p style="margin:0;font-size:12px;line-height:1.5;color:${COR_MUDO};">Mensagem transacional automática. Não é necessário responder.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function montarTextoTransacional(bloco: BlocoEmail): string {
  const linhas = [bloco.titulo, '', ...bloco.paragrafos];

  if (bloco.botao) {
    linhas.push('', bloco.botao.rotulo, bloco.botao.url);
  }
  if (bloco.linkExtra) {
    linhas.push('', bloco.linkExtra.rotulo, bloco.linkExtra.url);
  }
  if (bloco.aviso) {
    linhas.push('', bloco.aviso);
  }

  const organizacao = organizacaoDe(bloco);
  linhas.push('', marcaDe(bloco));
  if (organizacao) linhas.push(organizacao);
  linhas.push('Mensagem transacional automática. Não é necessário responder.');
  return linhas.join('\n');
}

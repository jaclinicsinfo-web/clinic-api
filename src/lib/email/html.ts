const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caractere) => ENTIDADES[caractere] ?? caractere);
}

export function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] || 'olá';
}

export function hospedeDoLink(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

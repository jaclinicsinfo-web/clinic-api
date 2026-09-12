const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export interface ContextoMensagem {
  pacienteNome: string;
  profissionalNome: string;
  data: string;
  horario: string;
  procedimento: string;
  unidade: string;
  sala: string;
  clinicaNome: string;
  tipoAtendimento: string;
}

export function mapaPlaceholders(contexto: ContextoMensagem): Record<string, string> {
  return {
    'paciente.nome': contexto.pacienteNome,
    paciente: contexto.pacienteNome,
    'profissional.nome': contexto.profissionalNome,
    profissional: contexto.profissionalNome,
    data: contexto.data,
    horario: contexto.horario,
    hora: contexto.horario,
    procedimento: contexto.procedimento,
    'tipo.atendimento': contexto.tipoAtendimento,
    tipo: contexto.tipoAtendimento,
    unidade: contexto.unidade,
    local: contexto.unidade,
    sala: contexto.sala || '—',
    'clinica.nome': contexto.clinicaNome,
    clinica: contexto.clinicaNome,
  };
}

export function interpolarTexto(modelo: string, contexto: ContextoMensagem): string {
  const mapa = mapaPlaceholders(contexto);
  return modelo.replace(PLACEHOLDER, (_match, chave: string) => mapa[chave] ?? '');
}

export function parametrosWhatsapp(modelo: string, contexto: ContextoMensagem): string[] {
  const mapa = mapaPlaceholders(contexto);
  const valores: string[] = [];
  const visto = new Set<number>();
  let indice = 0;
  modelo.replace(PLACEHOLDER, (_match, chave: string) => {
    if (!visto.has(indice)) {
      valores.push(mapa[chave] ?? '');
      visto.add(indice);
    }
    indice += 1;
    return '';
  });
  return valores;
}

export function formatarDataPt(isoCivil: string): string {
  const [ano, mes, dia] = isoCivil.split('-');
  if (!ano || !mes || !dia) return isoCivil;
  return `${dia}/${mes}/${ano}`;
}

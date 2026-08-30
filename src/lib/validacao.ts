const DDDS_BRASIL = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function todosDigitosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

function digitoVerificadorCnpj(base: string, pesos: number[]): number {
  const soma = base.split('').reduce((acc, digito, indice) => acc + Number(digito) * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string): boolean {
  const cnpj = valor.replace(/\D/g, '');
  if (cnpj.length !== 14 || todosDigitosIguais(cnpj)) return false;

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = digitoVerificadorCnpj(cnpj.slice(0, 12), pesos1);
  const d2 = digitoVerificadorCnpj(cnpj.slice(0, 12) + d1, pesos2);

  return cnpj.endsWith(`${d1}${d2}`);
}

export function telefoneValido(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '');
  if ((digitos.length !== 10 && digitos.length !== 11) || todosDigitosIguais(digitos)) return false;
  if (!DDDS_BRASIL.has(Number(digitos.slice(0, 2)))) return false;

  const primeiroDoNumero = digitos[2];
  if (digitos.length === 11) return primeiroDoNumero === '9';
  return primeiroDoNumero >= '2' && primeiroDoNumero <= '5';
}

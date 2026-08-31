import { prisma } from '../config/database';
import { gerarHash } from '../lib/password';
import { gerarTokenOpaco, hashToken } from '../lib/token';

const VALIDADE_MS = 60 * 60 * 1000;

export async function criarRecuperacao(usuarioId: string) {
  await prisma.recuperacaoSenha.updateMany({
    where: { usuarioId, usadoEm: null },
    data: { usadoEm: new Date() },
  });

  const { token, hash } = gerarTokenOpaco();
  await prisma.recuperacaoSenha.create({
    data: {
      usuarioId,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + VALIDADE_MS),
    },
  });

  return token;
}

export async function redefinirComToken(token: string, senha: string) {
  const registro = await prisma.recuperacaoSenha.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: { select: { id: true, status: true } } },
  });

  if (!registro || registro.usadoEm || registro.expiraEm.getTime() < Date.now()) {
    return null;
  }

  if (registro.usuario.status !== 'ativo') {
    return null;
  }

  const senhaHash = await gerarHash(senha);
  await prisma.$transaction([
    prisma.usuario.update({ where: { id: registro.usuarioId }, data: { senhaHash } }),
    prisma.recuperacaoSenha.update({ where: { id: registro.id }, data: { usadoEm: new Date() } }),
  ]);

  return registro.usuarioId;
}

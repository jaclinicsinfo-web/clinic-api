import { Request, Response, NextFunction } from 'express';
import {
  loginSchema,
  primeiroAcessoSchema,
  recuperarSenhaSchema,
  redefinirSenhaSchema,
  selecionarUnidadeSchema,
  temaSchema,
} from '../validators/auth.validator';
import {
  atualizarNome,
  buscarPorEmail,
  buscarPorId,
  registrarAcesso,
  possuiAcessoUnidade,
  atualizarTema,
} from '../models/usuario.model';
import { criarRecuperacao, redefinirComToken } from '../models/recuperacao-senha.model';
import {
  atualizarUnidade,
  buscarPorId as buscarUnidadePorId,
  concederAcesso,
  criarUnidade,
  nomeJaExiste,
} from '../models/unidade.model';
import { assertPodeAdicionarUnidade, usoDaClinica } from '../models/plano.model';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';
import { assinarToken, assinarTokenPagamento } from '../lib/jwt';
import { conferirSenha } from '../lib/password';
import { enviarEmail, montarEmailRedefinirSenha } from '../lib/email';
import { env, isDev } from '../config/env';
import { bloqueioDeCobranca } from '../lib/assinatura';
import { AppError } from '../lib/erros';
import { comTenant, comoSistema } from '../lib/tenant';
import {
  montarSessao,
  montarMe,
  montarSelecaoUnidade,
  montarLogout,
} from '../views/auth.view';

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, senha, lembrar } = loginSchema.parse(req.body);

    const usuario = await comoSistema(() => buscarPorEmail(email));
    if (!usuario) {
      throw new AppError(401, 'Não encontramos esse usuário.');
    }

    const senhaConfere = await conferirSenha(senha, usuario.senhaHash);
    if (!senhaConfere) {
      throw new AppError(401, 'E-mail ou senha incorretos.');
    }

    if (usuario.clinica.status !== 'ativa') {
      throw new AppError(403, 'Esta clínica está desativada.');
    }

    const bloqueio = bloqueioDeCobranca(usuario.clinica);
    if (bloqueio) {
      // A senha já conferiu: o administrador recebe um token curto que só serve para pagar.
      const podePagar =
        usuario.status === 'ativo' && usuario.perfil.nome === NOME_PERFIL_ADMINISTRADOR;
      throw new AppError(
        403,
        podePagar ? bloqueio.mensagem : `${bloqueio.mensagem} Fale com o administrador da clínica.`,
        {
          codigo: bloqueio.codigo,
          ...(podePagar
            ? {
                pagamentoToken: assinarTokenPagamento(usuario.id, usuario.clinicaId),
                planoAtual: usuario.clinica.plano.codigo,
                cicloAtual: usuario.clinica.cicloCobranca,
              }
            : {}),
        },
      );
    }

    if (usuario.status !== 'ativo') {
      throw new AppError(
        403,
        'Este usuário está inativo. Fale com o administrador da clínica.',
      );
    }

    const primeiroAcesso =
      usuario.ultimoAcesso == null && usuario.perfil.nome === NOME_PERFIL_ADMINISTRADOR;

    const unidadesAtivas = usuario.usuarioUnidades.filter((item) => item.unidade.ativo);
    if (unidadesAtivas.length === 0 && !primeiroAcesso) {
      throw new AppError(
        403,
        'Nenhuma unidade liberada para este usuário. Fale com o administrador.',
      );
    }

    const unidadeAtualId =
      unidadesAtivas.length === 1 ? unidadesAtivas[0].unidadeId : null;

    const token = assinarToken(
      {
        sub: usuario.id,
        email: usuario.email,
        perfilId: usuario.perfilId,
        clinicaId: usuario.clinicaId,
        unidadeAtualId,
      },
      lembrar,
    );

    await comTenant(usuario.clinicaId, async () => {
      if (!primeiroAcesso) {
        await registrarAcesso(usuario.id, usuario.clinicaId);
      }

      const atualizado = await buscarPorId(usuario.id);
      if (!atualizado) {
        throw new AppError(401, 'Sessão expirada. Entre novamente.');
      }

      const uso = await usoDaClinica(atualizado.clinicaId);

      res.json({
        ...montarSessao({ token, usuario: atualizado, unidadeAtualId, uso }),
        primeiroAcesso,
      });
    });
  } catch (err) {
    next(err);
  }
}

export async function concluirPrimeiroAcesso(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth!;
    const dados = primeiroAcessoSchema.parse(req.body);
    const usuario = await buscarPorId(auth.sub);

    if (!usuario || usuario.clinicaId !== auth.clinicaId) {
      throw new AppError(401, 'Sessão expirada. Entre novamente.');
    }
    if (usuario.perfil.nome !== NOME_PERFIL_ADMINISTRADOR || usuario.ultimoAcesso) {
      throw new AppError(400, 'O primeiro acesso já foi concluído.');
    }

    await atualizarNome(usuario.id, usuario.clinicaId, dados.adminNome);

    const unidadeAtiva = usuario.usuarioUnidades.find((item) => item.unidade.ativo);
    let unidadeId = unidadeAtiva?.unidadeId ?? null;

    if (unidadeId) {
      if (await nomeJaExiste(usuario.clinicaId, dados.unidadeNome, unidadeId)) {
        throw new AppError(409, 'Já existe uma unidade com este nome.');
      }
      await atualizarUnidade(unidadeId, usuario.clinicaId, {
        nome: dados.unidadeNome,
        cidade: dados.unidadeCidade,
      });
    } else {
      if (await nomeJaExiste(usuario.clinicaId, dados.unidadeNome)) {
        throw new AppError(409, 'Já existe uma unidade com este nome.');
      }
      await assertPodeAdicionarUnidade(usuario.clinicaId);
      const criada = await criarUnidade({
        clinicaId: usuario.clinicaId,
        nome: dados.unidadeNome,
        cidade: dados.unidadeCidade,
      });
      await concederAcesso(criada.id, [usuario.id]);
      unidadeId = criada.id;
    }

    await registrarAcesso(usuario.id, usuario.clinicaId);
    const atualizado = await buscarPorId(usuario.id);
    if (!atualizado) {
      throw new AppError(401, 'Sessão expirada. Entre novamente.');
    }

    const token = assinarToken(
      {
        sub: atualizado.id,
        email: atualizado.email,
        perfilId: atualizado.perfilId,
        clinicaId: atualizado.clinicaId,
        unidadeAtualId: unidadeId,
      },
      true,
    );
    const uso = await usoDaClinica(atualizado.clinicaId);

    res.json({
      ...montarSessao({ token, usuario: atualizado, unidadeAtualId: unidadeId, uso }),
      primeiroAcesso: false,
    });
  } catch (err) {
    next(err);
  }
}

export async function selecionarUnidade(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth!;
    const { unidadeId } = selecionarUnidadeSchema.parse(req.body);

    const temAcesso = await possuiAcessoUnidade(auth.sub, unidadeId);
    if (!temAcesso) {
      throw new AppError(403, 'Você não tem acesso a esta unidade.');
    }

    const unidade = await buscarUnidadePorId(unidadeId);
    if (!unidade || !unidade.ativo || unidade.clinicaId !== auth.clinicaId) {
      throw new AppError(403, 'Você não tem acesso a esta unidade.');
    }

    const token = assinarToken({
      sub: auth.sub,
      email: auth.email,
      perfilId: auth.perfilId,
      clinicaId: auth.clinicaId,
      unidadeAtualId: unidadeId,
    });

    res.json(montarSelecaoUnidade({ token, unidade }));
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth!;
    const usuario = await buscarPorId(auth.sub);
    if (!usuario) {
      throw new AppError(401, 'Sessão expirada. Entre novamente.');
    }

    const uso = await usoDaClinica(usuario.clinicaId);

    res.json(
      montarMe({ usuario, unidadeAtualId: auth.unidadeAtualId, uso }),
    );
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  res.json(montarLogout());
}

export async function atualizarTemaPreferido(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth!;
    const { tema } = temaSchema.parse(req.body);
    const usuario = await atualizarTema(auth.sub, auth.clinicaId, tema);
    res.json({ tema: usuario.tema === 'escuro' ? 'escuro' : 'claro' });
  } catch (err) {
    next(err);
  }
}

const MENSAGEM_RECUPERACAO =
  'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.';

export async function solicitarRecuperacao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = recuperarSenhaSchema.parse(req.body);
    const usuario = await comoSistema(() => buscarPorEmail(email));

    if (usuario && usuario.status === 'ativo') {
      const token = await comTenant(usuario.clinicaId, () => criarRecuperacao(usuario.id));
      const link = `${env.FRONTEND_URL.replace(/\/+$/, '')}/redefinir-senha?token=${token}`;

      const mensagem = montarEmailRedefinirSenha({
        nome: usuario.nome,
        empresa: usuario.clinica.nomeFantasia,
        email: usuario.email,
        link,
        validadeMinutos: 60,
      });

      try {
        await enviarEmail({
          para: usuario.email,
          categoria: 'redefinir-senha',
          ...mensagem,
        });
      } catch (err) {
        if (isDev) {
          console.info('[email] link de recuperação (apenas desenvolvimento):', link);
        }
        throw err;
      }
    }

    res.json({ mensagem: MENSAGEM_RECUPERACAO });
  } catch (err) {
    next(err);
  }
}

export async function redefinirSenha(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token, senha } = redefinirSenhaSchema.parse(req.body);
    const usuarioId = await redefinirComToken(token, senha);
    if (!usuarioId) {
      throw new AppError(400, 'Este link é inválido ou já expirou. Solicite uma nova recuperação.');
    }

    res.json({ mensagem: 'Senha redefinida. Entre com a nova senha.' });
  } catch (err) {
    next(err);
  }
}

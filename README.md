# ClinicERP API

API REST do **ClinicERP**, o ERP back-office para clínicas (médicas, odontológicas e estéticas).
Esta entrega cobre **autenticação**, **setup do primeiro acesso** no painel, **gestão de usuários**,
**pacientes** e o **catálogo de planos** com limite de contas.

> Não existe portal do paciente. Não há sign-up aberto. A primeira clínica e o administrador nascem no
> painel (`POST /api/setup`) quando o banco está vazio. O plano vem da variável `PLANO` na API. Os
> demais usuários entram em Configurações › Usuários.

## Conceitos importantes

- **3 planos = limite de CONTAS (pessoas que fazem login).**
  - `essencial` → até 5 usuários
  - `profissional` → até 20 usuários
  - `ilimitado` → sem limite (`limiteUsuarios = null`)
  - Apenas usuários com `status = "ativo"` ocupam vaga. Ao inativar, a vaga é liberada.
- **5 perfis = papéis RBAC**, criados por clínica no cadastro: `Administrador`, `Gestor`, `Recepção`,
  `Profissional de saúde`, `Financeiro`. Existem nos 3 planos. Perfil é papel de permissão, **não** conta.
- **Plano = variável de ambiente.** `PLANO=essencial|profissional|ilimitado` no deploy da API. O
  primeiro acesso **não** pergunta o plano. Quem define é quem configura o servidor.
- **Setup no painel = banco vazio.** `GET /setup/status` diz se ainda não existe clínica. `POST /setup`
  cria clínica, 1 unidade, os 5 perfis e 1 usuário **Administrador** ativo, e devolve a sessão. Depois
  disso o endpoint responde 409.
- **Sem seed de clínica.** Depois do `migrate`, o banco fica vazio — exceto o **catálogo de 3 planos**,
  inserido pela própria migração de forma idempotente (`ON CONFLICT`).

## Arquitetura (MVC clássico)

```
Route → Controller → Model → Controller → View → JSON
```

- **Model** (`src/models`): único lugar que importa o Prisma. Sem `req`/`res`, sem JSON de resposta.
- **Controller** (`src/controllers`): `req → validator → model → view`. Erros via `next(err)`.
- **View** (`src/views`): funções puras que montam o JSON do contrato.
- **Routes** (`src/routes`): só HTTP → controller.

```
src/
  app.ts            server.ts
  config/           env.ts, database.ts
  middlewares/      auth, admin, landing, error, rate-limit
  routes/           index, health, auth, cadastro, setup, usuarios, planos
  models/           plano, clinica, unidade, usuario, perfil-acesso, paciente, convenio
  controllers/      health, auth, cadastro, setup, usuarios, planos
  views/            health, auth, cadastro, setup, usuarios, planos, error
  validators/       auth, cadastro, setup, usuarios
  lib/              jwt, password, mail, perfis-padrao, erros
prisma/schema.prisma
```

## Stack

Node 20+, Express, TypeScript (strict), Prisma + PostgreSQL, JWT, bcrypt, zod, cors, helmet, dotenv,
express-rate-limit.

## Como rodar (dev local)

1. **Instalar dependências**

```bash
npm install
```

2. **Configurar `.env`** (copie de `.env.example`). No dev local use a **URL externa** do Postgres do Render
   com `?sslmode=require` e defina a `LANDING_API_KEY`:

```env
DATABASE_URL="postgresql://USUARIO:SENHA@HOST.ohio-postgres.render.com/BANCO?sslmode=require"
LANDING_API_KEY=troque-esta-chave-da-landing
```

3. **Migrar o banco** (cria as tabelas e insere os 3 planos do catálogo):

```bash
npm run prisma:migrate     # equivale a: prisma migrate dev
```

4. **Subir a API**

```bash
npm run dev                # http://localhost:3001/api
```

Scripts disponíveis: `dev`, `build`, `start`, `prisma:migrate` (dev), `prisma:deploy` (produção),
`prisma:generate`.

## Produção (Render)

Use a **URL interna** do banco + `?sslmode=require` na `DATABASE_URL` e rode as migrações com
`npm run prisma:deploy` (`prisma migrate deploy`). O `build` roda `prisma generate && tsc`; o `start`
executa `dist/server.js`.

## Segurança

- `helmet`, CORS por lista (painel + landing), bcrypt (10+ rounds), rate limit em login, setup e cadastro.
- A landing autentica com `X-Landing-Key` (comparação *timing-safe*).
- Nunca são logados senha, token, `LANDING_API_KEY` nem `DATABASE_URL`.
- Erros sempre no formato `{ "message": "..." }` em pt-BR. IDs são UUID; datas em ISO 8601.

## Endpoints

Base: `http://localhost:3001/api` · JSON · Bearer JWT.

| Método | Rota                        | Auth              |
|--------|-----------------------------|-------------------|
| GET    | `/health`                   | público           |
| GET    | `/planos`                   | público           |
| GET    | `/setup/status`             | público           |
| POST   | `/setup`                    | público (só se vazio) |
| POST   | `/cadastro`                 | `X-Landing-Key`   |
| POST   | `/auth/login`               | público           |
| POST   | `/auth/selecionar-unidade`  | Bearer            |
| GET    | `/auth/me`                  | Bearer            |
| POST   | `/auth/logout`              | Bearer            |
| GET    | `/usuarios`                 | Bearer            |
| POST   | `/usuarios`                 | Bearer (admin)    |
| PATCH  | `/usuarios/:id/inativar`    | Bearer (admin)    |
| PATCH  | `/usuarios/:id/ativar`      | Bearer (admin)    |
| GET    | `/pacientes`                | Bearer            |
| GET    | `/pacientes/opcoes`         | Bearer            |
| POST   | `/pacientes`                | Bearer            |
| GET    | `/pacientes/:id`            | Bearer            |
| PATCH  | `/pacientes/:id`            | Bearer            |
| PATCH  | `/pacientes/:id/arquivar`   | Bearer            |

## Exemplos com curl

**Health**

```bash
curl http://localhost:3001/api/health
# { "ok": true, "service": "clinicerp-api" }
```

**Listar planos** (a landing usa isto)

```bash
curl http://localhost:3001/api/planos
```

**Status do setup** (banco vazio → o painel abre o wizard)

```bash
curl http://localhost:3001/api/setup/status
# { "precisaSetup": true }
```

**Setup do primeiro acesso** (só funciona enquanto não existir clínica; o plano vem de `PLANO`)

```bash
curl -X POST http://localhost:3001/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "clinica": {
      "nomeFantasia": "Clínica Exemplo",
      "razaoSocial": "Clínica Exemplo LTDA",
      "cnpj": "12345678000190",
      "telefone": "1633214500",
      "email": "contato@clinica.com.br"
    },
    "unidade": { "nome": "Unidade Centro", "cidade": "Ribeirão Preto" },
    "usuario": { "nome": "Dona Admin", "email": "admin@clinica.com.br", "senha": "minimo8chars" }
  }'
```

**Cadastro pós-compra** (após o pagamento; requer `X-Landing-Key` e o `plano` pago)

```bash
curl -X POST http://localhost:3001/api/cadastro \
  -H "Content-Type: application/json" \
  -H "X-Landing-Key: troque-esta-chave-da-landing" \
  -d '{
    "plano": "essencial",
    "clinica": {
      "nomeFantasia": "Clínica Exemplo",
      "razaoSocial": "Clínica Exemplo LTDA",
      "cnpj": "12345678000190",
      "telefone": "1633214500",
      "email": "contato@clinica.com.br"
    },
    "unidade": { "nome": "Unidade Centro", "cidade": "Ribeirão Preto" },
    "usuario": { "nome": "Dona Admin", "email": "admin@clinica.com.br", "senha": "minimo8chars" }
  }'
```

Retorna o mesmo shape do login, acrescido de `plano` e `usoUsuarios`.

**Login**

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin@clinica.com.br", "senha": "minimo8chars", "lembrar": false }'
```

`lembrar: true` → token de 7 dias; caso contrário, 12h. Com 1 unidade, `unidadeAtualId` já vem preenchido;
com 2+ unidades vem `null` (use `POST /auth/selecionar-unidade`).

## Gestão de usuários

`GET /usuarios` lista as contas da clínica autenticada, com perfis, unidades, plano e uso
(Administrador e Gestor). `POST /usuarios` cria uma conta com o `perfilId` escolhido
(somente Administrador) e valida o limite do plano. `PATCH /usuarios/:id/perfil` altera o
perfil de outro usuário (Administrador e Gestor). Inativar libera a vaga; reativar volta a
ocupá-la. Não é possível alterar o próprio perfil, inativar a própria conta nem o último
Administrador. Gestor não atribui o perfil Administrador nem altera a conta de um administrador.

O `usuario.model.criarUsuario()` **sempre** chama `assertPodeAdicionarUsuario` antes de persistir
um usuário ativo, retornando **403** com a mensagem
_"Limite de usuários do plano atingido. Faça upgrade para adicionar mais contas."_ quando o plano estoura.

## Pacientes

`GET /pacientes` lista os pacientes da clínica, com resumo, convênios ativos e profissionais de saúde
(usuários com esse perfil). `POST /pacientes` cadastra na unidade da sessão. CPF é único por clínica.

Quem tem o perfil **Profissional de saúde** só vê e edita pacientes em que é o profissional preferido.
Os demais perfis com permissão de visualizar veem a base inteira da clínica. Arquivar exige `editar`.

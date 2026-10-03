# ClinicERP API

API REST do **ClinicERP**, o ERP back-office para clínicas (médicas, odontológicas e estéticas).
Esta entrega cobre **autenticação**, **setup do primeiro acesso** no painel, **gestão de usuários**,
**pacientes** e o **catálogo de planos** com limite de contas.

> Não existe portal do paciente. Não há sign-up aberto. A clínica e o administrador nascem no
> clinic-panel, que chama `POST /api/cadastro` com o plano escolhido na criação. Os demais usuários
> entram em Configurações › Usuários.

## Conceitos importantes

- **3 planos = limite de contas, unidades e módulos.**
  - `essencial` → até 5 usuários, 1 unidade, núcleo operacional (agenda, pacientes, prontuário, profissionais, convênios, LGPD)
  - `profissional` → até 20 usuários, várias unidades, + financeiro, relatórios e estoque
  - `ilimitado` → sem limite de contas ou unidades, + integrações, Power BI e agente de IA
  - Apenas usuários com `status = "ativo"` ocupam vaga. Ao inativar, a vaga é liberada.
- **5 perfis = papéis RBAC**, criados por clínica no cadastro: `Administrador`, `Gestor`, `Recepção`,
  `Profissional de saúde`, `Financeiro`. Existem nos 3 planos. Perfil é papel de permissão, **não** conta.
  O plano corta o módulo mesmo que o perfil tenha a permissão marcada.
- **Plano por clínica.** O código (`essencial`, `profissional` ou `ilimitado`) vai no corpo da criação
  e fica em `clinica.planoId`. O clinic-panel escolhe esse plano ao abrir a clínica e pode trocá-lo
  depois, na ficha da clínica. Reiniciar a API não altera o plano de quem já existe.
- **Isolamento multi-tenant.** O banco é compartilhado. Cada linha de negócio tem `clinicaId` (ou é filha
  de uma tabela que tem) e uma política RLS `tenant_isolamento`. A API grava `app.clinica_id` na sessão
  do Postgres a partir do JWT. Tabela nova de negócio precisa nascer com `clinicaId` e com a política do
  modelo na seção 5.5 do planejamento. `planos` e `_prisma_migrations` ficam sem RLS. Script manual que
  precise ver o banco inteiro deve abrir a transação com `SET LOCAL app.modo_sistema = 'on'`.
- **Setup com banco vazio.** `GET /setup/status` diz se ainda não existe clínica. `POST /setup`
  cria clínica, 1 unidade, os 5 perfis e 1 usuário **Administrador** ativo, e devolve a sessão.
  O plano vem no corpo do pedido. Depois disso o endpoint responde 409. O clinic-panel cria as
  clínicas pelo `POST /cadastro`, que também recebe o plano.
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

**Setup com o banco vazio** (o plano vem no corpo)

```bash
curl -X POST http://localhost:3001/api/setup \
  -H "Content-Type: application/json" \
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

## Integrações e lembretes

Módulo do plano Ilimitado (`exigirPermissao('integracoes')`). Documentação de operação:
`clinic-web-app/docs/integracoes-e-lembretes.md`.

| Método | Rota | Auth |
|--------|------|------|
| GET | `/integracoes` | Bearer |
| GET/PATCH | `/integracoes/configuracao` | Bearer |
| POST | `/integracoes/whatsapp/teste` | Bearer |
| POST | `/integracoes/email/teste` | Bearer |
| GET/POST | `/integracoes/regras` | Bearer |
| PATCH/DELETE | `/integracoes/regras/:id` | Bearer |
| GET/POST | `/integracoes/templates` | Bearer |
| PATCH/DELETE | `/integracoes/templates/:id` | Bearer |
| GET | `/integracoes/custos` | Bearer |
| GET | `/integracoes/envios` | Bearer |
| POST | `/integracoes/processar` | Bearer |
| GET/POST | `/webhooks/whatsapp/:clinicaId` | público (verify token / HMAC da Meta) |

Credenciais ficam cifradas no banco. A resposta da API nunca devolve token ou senha completos.

## Pacientes

`GET /pacientes` lista os pacientes da clínica, com resumo, convênios ativos e profissionais de saúde
(usuários com esse perfil). `POST /pacientes` cadastra na unidade da sessão. CPF é único por clínica.

Quem tem o perfil **Profissional de saúde** só vê e edita pacientes em que é o profissional preferido.
Os demais perfis com permissão de visualizar veem a base inteira da clínica. Arquivar exige `editar`.

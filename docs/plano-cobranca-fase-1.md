# Cobrança — fase 1: lembretes, e-mail confiável e conferência com o Mercado Pago

Plano de implementação das três prioridades altas que vieram depois da entrega do pagamento pelo
Mercado Pago (branch `dev`, outubro de 2026). Tudo nasce na `dev` e só vai para a `main` depois de
testado no ambiente de teste.

| # | Entrega | Problema que resolve |
|---|---------|----------------------|
| 1 | E-mail transacional com fila e reenvio automático | O Gmail bloqueia a conta (`534 WebLoginRequired`), limita envios e o e-mail de acesso que falha só sai pelo botão do painel. |
| 2 | Lembretes de cobrança e recibo | O mensal é pago à mão todo mês. Sem lembrete, a clínica esquece e cai no bloqueio. |
| 3 | Conferência periódica com o Mercado Pago | Estorno só é aplicado se o aviso (webhook) chegar. Pix pago com a aba fechada depende do aviso. Aviso recusado ou perdido hoje vira pagamento esquecido. |

Ordem sugerida: **1 → 2 → 3**. Os lembretes usam a fila de e-mail da entrega 1.

> **Status (11/10/2026): implementado na `dev`.** Diferenças em relação ao plano:
> - Sem trava `pg_advisory_lock` entre instâncias: as tarefas são idempotentes (chave única na fila,
>   `FOR UPDATE SKIP LOCKED`, reserva atômica do pedido, estorno atômico), então duas instâncias não causam efeito
>   em dobro, só chamadas repetidas ao Mercado Pago.
> - A troca do Gmail pelo provedor transacional é só configuração (envs + DNS) e depende do domínio.
> - "Reenviar acesso" para clínica em teste no painel ficou de fora: a fila já reenvia sozinha por até 24 h.
> - Pedido `expirado` continua aceitando pagamento (Pix gerado antes de expirar), pelo aviso ou pela conferência.
> - Arquivos: `src/lib/email/fila.ts`, `src/lib/email/templates/cobranca.ts`, `src/lib/cobranca/lembretes.ts`,
>   `src/lib/cobranca/conciliacao.ts`, `src/lib/tarefas-cobranca.ts`, `src/models/email-saida.model.ts`,
>   `src/models/cobranca-assinatura.model.ts`; migração `20261011090000_cobranca_fase1`.

---

## Como está hoje (ponto de partida)

- **Pagamento:** `src/services/assinatura.service.ts`. `cumprir()` confirma o pedido. Origem `aviso` (webhook),
  `retorno` (página de retorno) ou `local`.
- **Mercado Pago:** `src/lib/mercadopago.ts` (`criarPreferencia`, `buscarPagamento`, `buscarPagamentosDoPedido`).
- **Pedidos:** tabela `pedidos_assinatura` (`status`: pendente, processando, pago, revisao, estornado).
- **Vencimento:** `clinicas.pagoAte` (timestamptz). Nulo = cobrança manual pelo painel, nunca bloqueia.
  Regras de período, carência (5 dias) e bloqueio em `src/lib/assinatura.ts` (`resumoAssinatura`,
  `bloqueioDeCobranca`, `inicioDoNovoPeriodo`, `somarCiclo`).
- **Logs:** `src/lib/eventos-pagamento.ts` → tabela `eventos_pagamento` → painel › Logs.
- **E-mail:** `src/lib/email/` com nodemailer. `transporte.ts` aceita qualquer SMTP; Gmail é detectado pelo
  host/usuário. Layout pronto em `layout.ts` (`montarHtmlTransacional`, `montarTextoTransacional`).
- **Tarefa periódica existente:** `src/lib/integracoes/processador.ts` (`iniciarProcessadorLembretes`, com trava
  `ocupado` em memória), iniciada em `src/server.ts`.
- **Notificação no sistema:** tabela `notificacoes` (sino do topo), única por `(usuarioId, chave)`.

---

## 1. E-mail transacional com fila e reenvio automático

### 1.1 Trocar o Gmail por um provedor transacional

Recomendação: **Resend** ou **Amazon SES** (Brevo e Postmark também servem). Todos oferecem SMTP, então
**o código atual funciona só trocando as envs**:

```env
# Exemplo Resend
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<API key do Resend>
SMTP_FROM=J.A. Clinics <nao-responda@SEU-DOMINIO>
```

Pré-requisitos (fora do código):
- Um domínio próprio para o remetente (ex.: `jaclinics.com.br`). **Pergunta em aberto: qual domínio?**
- DNS do domínio: registros **SPF**, **DKIM** (o provedor gera) e **DMARC** (`p=none` no começo).
- Uma chave para a dev e outra para a produção (ambientes isolados).

Ajuste pequeno no código: em `transporte.ts`, para porta 465 usar `secure: true` (já existe) e confirmar que
`ehGmail()` não dispara para o novo host.

### 1.2 Fila de saída (`emails_saida`)

Todo e-mail transacional passa a entrar numa fila e sair por um processador com novas tentativas. O envio
síncrono continua só como primeira tentativa imediata, para a pessoa receber na hora.

Migração `AAAAMMDDhhmmss_emails_saida`:

```sql
CREATE TABLE "emails_saida" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tipo" TEXT NOT NULL,              -- acesso | recibo | lembrete_cobranca | teste_gratis | redefinir_senha
  "chave" TEXT NOT NULL,             -- idempotência (ver 2.3); nunca envia duas vezes a mesma chave
  "para" TEXT NOT NULL,
  "assunto" TEXT NOT NULL,
  "conteudo" TEXT,                   -- JSON {html, texto} cifrado com cifrarSegredo(); vira NULL depois de enviado
  "status" TEXT NOT NULL DEFAULT 'pendente',  -- pendente | enviando | enviado | falhou | cancelado
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "proximaTentativaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoErro" TEXT,
  "clinicaId" UUID,
  "pedidoId" UUID,
  "enviadoEm" TIMESTAMPTZ(3),
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "emails_saida_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "emails_saida_chave_key" ON "emails_saida"("chave");
CREATE INDEX "emails_saida_fila_idx" ON "emails_saida"("status", "proximaTentativaEm");
```

Por que cifrar: o e-mail de acesso contém a **senha temporária**. Ela não pode ficar legível no banco.
Usar `cifrarSegredo` / `decifrarSegredo` de `src/lib/segredo.ts` e apagar o conteúdo (`NULL`) assim que sair.

Arquivos novos:
- `src/models/email-saida.model.ts`: `enfileirar`, `reservarLote` (UPDATE … WHERE status='pendente' AND
  proximaTentativaEm <= now() … RETURNING, com `FOR UPDATE SKIP LOCKED`), `marcarEnviado`, `marcarFalha`.
- `src/lib/email/fila.ts`:
  - `enfileirarEmail({ tipo, chave, para, mensagem, clinicaId?, pedidoId?, enviarAgora? })`: grava e, se
    `enviarAgora`, tenta na hora. Chave repetida = não faz nada (devolve o registro existente).
  - `processarFilaEmails()`: lote de 20, backoff **1 min → 5 min → 15 min → 1 h → 6 h → 24 h** (6 tentativas).
    Depois disso, `falhou` + evento de erro.
- Ao enviar um e-mail de `tipo = 'acesso'` com sucesso: preencher `pedidos_assinatura.acessoEnviadoEm`.

Mudanças:
- `cumprirNovaClinica` e `iniciarAcessoGratuito`: trocar `entregarAcesso` por `enfileirarEmail(..., enviarAgora: true)`.
  Se a primeira tentativa falhar, a resposta já é a de "clínica aberta, o e-mail está a caminho" e a fila insiste.
- `reenviarAcesso` (painel): gera senha nova e enfileira com chave nova (`acesso:<pedidoId>:<timestamp>`).
- Recuperação de senha (`auth.controller.ts`): pode continuar síncrona; migrar para a fila é opcional.
- Teste grátis: mesmo tratamento do acesso pago (hoje não tem reenvio pelo painel). **Decidir se o painel ganha
  "Reenviar acesso" para clínicas em teste também.**

### 1.3 Processador único de tarefas

Criar `src/lib/tarefas.ts` para concentrar as tarefas periódicas da cobrança:

```ts
iniciarTarefasCobranca(): NodeJS.Timeout[]
// a cada 1 min: processarFilaEmails()
// a cada 10 min: processarLembretesCobranca()   (entrega 2)
// a cada 15 min: conciliarPagamentos()          (entrega 3)
```

- Chamar em `src/server.ts` ao lado de `iniciarProcessadorLembretes` e parar no desligamento.
- **Trava entre instâncias**: se um dia a API rodar com mais de uma réplica, a trava em memória não basta.
  Cada tarefa abre a transação com `SELECT pg_try_advisory_xact_lock(<número da tarefa>)` e sai se não conseguir.
- Variável para desligar em teste local: `TAREFAS_COBRANCA=off`.

### 1.4 Logs

Novos tipos em `TipoEventoPagamento` e no painel (`src/lib/logs.ts` do clinic-panel):
`email_enfileirado` (info), `email_enviado` (info), `email_tentativa_falhou` (aviso), `email_desistiu` (erro).
O painel › Logs ganha o filtro "E-mails" e o cartão "E-mails com falha (24 h)".

### 1.5 Aceite
- [ ] Com o provedor novo na dev, o log mostra `[email] SMTP autenticado`.
- [ ] Derrubar o SMTP (senha errada) → pagamento confirma, clínica abre, e-mail fica `pendente` com tentativas
      crescendo; ao corrigir a senha, sai sozinho e `acessoEnviadoEm` é preenchido.
- [ ] A senha temporária nunca aparece legível em `emails_saida` (conferir no banco antes e depois do envio).
- [ ] Mesma chave enfileirada duas vezes → um envio só.

---

## 2. Lembretes de cobrança e recibo

### 2.1 Calendário

Vale só para clínicas com `pagoAte` preenchido (pagas pelo Mercado Pago) e `status = 'ativa'`.
Marcos contados a partir de `pagoAte` (D0), no fuso `America/Sao_Paulo`:

| Marco | Mensal | Anual | Assunto sugerido |
|---|---|---|---|
| D-30 | — | ✔ | "Sua anuidade vence em 30 dias" |
| D-5 | ✔ | ✔ | "Sua assinatura vence em 5 dias" |
| D-1 | ✔ | ✔ | "Sua assinatura vence amanhã" |
| D0 | ✔ | ✔ | "Sua assinatura vence hoje" |
| D+1 | ✔ | ✔ | "Pagamento pendente: 4 dias até o bloqueio" |
| D+3 | ✔ | ✔ | "Último aviso: o acesso será bloqueado em 2 dias" |
| D+5 | ✔ | ✔ | "Acesso bloqueado: pague para voltar" |

Teste grátis (ajuda a converter):

| Marco | Assunto |
|---|---|
| fim do teste − 2 dias | "Seu teste termina em 2 dias" |
| fim do teste | "Seu teste terminou: escolha um plano" |

Mais o **recibo**, enviado no `pedido_pago`: plano, ciclo, valor, meio (Pix/cartão e parcelas), período
coberto e número do pagamento no Mercado Pago.

Função pura em `src/lib/assinatura.ts` (com testes):

```ts
marcoDeCobranca(clinica, agora): { marco: 'D-30' | 'D-5' | 'D-1' | 'D0' | 'D+1' | 'D+3' | 'D+5' | 'teste-2' | 'teste-fim'; referencia: Date } | null
```

Regra: devolve o marco **mais recente já alcançado** que ainda não foi enviado. Se o servidor ficou fora do ar
e pulou D-1, no D0 manda só o D0 (não manda os dois).

### 2.2 Destinatários e conteúdo
- Para: **todos os administradores ativos** da clínica. Cópia para `clinicas.email` (decidir; sugestão: sim
  a partir do D+1).
- Botão principal: `FRONTEND_URL/configuracoes/assinatura` (antes do bloqueio) ou `FRONTEND_URL/login`
  (bloqueada, porque o login mostra os planos para pagar).
- Texto curto, valor do plano atual, data de vencimento e data de bloqueio. Template novo em
  `src/lib/email/templates/cobranca.ts` usando `montarHtmlTransacional`.
- Janela de envio: das 8h às 20h de São Paulo. Fora disso, o processador espera.
- Também criar notificação no sino (`notificacoes`, chave igual à do e-mail) para os administradores.

### 2.3 Idempotência
Chave na fila: `cobranca:<clinicaId>:<pagoAte em ISO>:<marco>`.
Quando a clínica paga, `pagoAte` muda e o ciclo de chaves recomeça sozinho. Antes de enviar, o processador
**reconfirma a situação** (se pagou entre o enfileiramento e o envio, cancela).

### 2.4 Processador
`processarLembretesCobranca()` em `src/lib/cobranca/lembretes.ts`:
1. Busca clínicas candidatas: `pagoAte BETWEEN now() - 6 dias AND now() + 31 dias`, ou em teste com
   `trialExpiraEm` nos próximos 3 dias / até 1 dia atrás.
2. Para cada uma, calcula `marcoDeCobranca`. Se houver, enfileira e-mail(s) e notificação.
3. Registra `lembrete_enfileirado` em `eventos_pagamento` (aparece em Logs).

### 2.5 Aceite
- [ ] Alterar `pagoAte` no banco dev para cair em cada marco → chega um e-mail por marco, nunca repetido.
- [ ] Pagar no D+1 → nenhum lembrete D+3/D+5 daquele vencimento.
- [ ] Recibo chega após cada pagamento confirmado, com meio e parcelas corretos.
- [ ] Clínica com `pagoAte` nulo (cobrança manual) nunca recebe lembrete.

---

## 3. Conferência periódica com o Mercado Pago (conciliação)

### 3.1 O que confere
`conciliarPagamentos()` em `src/lib/cobranca/conciliacao.ts`, a cada 15 min:

| Grupo | Critério | Ação |
|---|---|---|
| Pendentes recentes | `status IN ('pendente','processando')` e criados nas últimas **72 h** com `preferenciaId` | `buscarPagamentosDoPedido` → aprovado e valor confere → `cumprir(id, pagamentoId, 'conciliacao')` |
| Pagos recentes | `status = 'pago'` e `pagoEm` nas últimas **48 h** | `buscarPagamento(pagamentoId)` → `refunded`/`charged_back` → `estornarPedido` |
| Pagos antigos | `pagoEm` entre 48 h e **180 dias** | Mesma checagem, **uma vez por dia** (madrugada) |
| Em revisão | `status = 'revisao'` | Só alerta (evento de erro diário) até alguém resolver |

Detalhes:
- Acrescentar `'conciliacao'` em `OrigemConfirmacao` (`assinatura.service.ts`).
- Pausa de ~200 ms entre chamadas ao Mercado Pago; parar o ciclo ao receber 429 e tentar no próximo.
- Coluna nova `pedidos_assinatura."conferidoEm" TIMESTAMPTZ(3)` para a checagem diária não repetir pedidos.
- Pedido pendente com mais de 72 h: marcar `status = 'expirado'` (a preferência vence em 48 h), para sair da
  lista de leads ativos. Ajustar o painel (Leads) para mostrar "Expirado".

### 3.2 Logs
- Evento `conciliacao_aplicou` (aviso) quando a conferência pagar ou estornar algo **que o aviso não aplicou**.
  Isso é o termômetro do webhook: se aparecer com frequência, a assinatura secreta ou a URL estão erradas.
- Sem evento quando não encontra nada (evita ruído).
- Painel › Logs: cartão "Aplicados pela conferência (24 h)".

### 3.3 Aceite
- [ ] Com `MERCADOPAGO_WEBHOOK_SECRET` errado de propósito, pagar pelo checkout e fechar a aba antes de voltar
      → em até 15 min o pedido vira pago com origem `conciliacao`.
- [ ] Devolver um pagamento na conta vendedora de teste com o webhook recusando → em até 15 min (pagamento
      recente) o pedido vira `estornado` e o vencimento recua.
- [ ] Nenhuma chamada repetida ao Mercado Pago para o mesmo pedido antigo no mesmo dia.

---

## Testes

- Unitários (`node --test`, padrão de `src/lib/*.test.ts`): `marcoDeCobranca` (todos os marcos, pulo de marco,
  fuso), backoff da fila, decisão da conciliação com Mercado Pago simulado. Registrar os arquivos no script
  `test` do `package.json`.
- Integração: reaproveitar o roteiro com Mercado Pago simulado (Postgres descartável ou banco dev) e cobrir
  fila de e-mail, lembretes e conciliação.
- Ponta a ponta na dev: pagamentos reais de teste pelo checkout com a Buyer Test User; conferir Logs no painel.

## Variáveis de ambiente novas

```env
TAREFAS_COBRANCA=on            # off desliga fila, lembretes e conciliação (útil em teste local)
LEMBRETES_JANELA=08-20         # horário de envio (São Paulo)
EMAIL_COPIA_CLINICA=on         # cópia dos lembretes de atraso para o e-mail da clínica
```

## Ida para a produção
1. `pg_dump` do banco de produção.
2. Domínio e DNS (SPF, DKIM, DMARC) validados no provedor de e-mail; chave de produção nas envs.
3. Deploy da `main` (as migrações rodam sozinhas ao subir a API).
4. Acompanhar painel › Logs nas primeiras 48 h: e-mails com falha, conferência aplicando coisas (sinal de webhook
   errado) e erros.

## Perguntas em aberto
- Qual domínio será o remetente dos e-mails?
- Cópia dos lembretes para o e-mail da clínica: sim ou não?
- Lembretes do teste grátis entram já ou ficam para depois?
- O painel deve ganhar "Reenviar acesso" também para clínicas em teste grátis?

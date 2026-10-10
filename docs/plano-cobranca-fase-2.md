# Cobrança — fase 2: cobrança automática, histórico de pagamentos e troca de plano no meio do período

Plano de implementação das prioridades médias da cobrança. Depende da fase 1
([plano-cobranca-fase-1.md](plano-cobranca-fase-1.md)), principalmente da fila de e-mail, dos lembretes e da
conferência com o Mercado Pago. Tudo nasce na `dev` e só vai para a `main` depois de testado.

| # | Entrega | Para quem |
|---|---------|-----------|
| A | Cobrança automática no cartão, que o administrador ativa e desativa | Clínica que não quer pagar à mão todo mês |
| B | Histórico de pagamentos com recibo | Clínica (Configurações › Assinatura) e equipe (painel) |
| C | Troca de plano no meio do período, com cobrança proporcional | Clínica que quer subir ou descer de plano sem esperar o vencimento |

Ordem sugerida: **B → C → A**. O histórico é a base que os outros dois usam para mostrar o que foi cobrado;
a troca de plano define a regra de valores que a cobrança automática precisa respeitar.

---

## Ponto de partida (o que já existe)

- `pedidos_assinatura`: um pedido por pagamento (`tipo`: `nova_clinica` | `clinica_existente`; `status`:
  pendente, processando, pago, revisao, estornado; `periodoInicio`/`periodoFim`; `pagamentoId`).
- `clinicas.pagoAte`, `cicloCobranca`, `planoId`, `valorMensal`.
- Regras puras em `src/lib/assinatura.ts` (período, carência, bloqueio). Confirmação em
  `src/services/assinatura.service.ts` (`cumprir`, `registrarPagamentoClinica`, `estornarPedido`).
- Linha do tempo em `eventos_pagamento` → painel › Logs.
- Tela **Configurações › Assinatura** (web-app, só administrador) e seletor de plano/ciclo
  (`src/components/assinatura/seletor-pagamento.tsx`).

---

## B. Histórico de pagamentos

### B.1 Dados
Guardar no pedido o que hoje só existe no Mercado Pago, preenchido na confirmação (aviso, retorno ou conferência):

```sql
ALTER TABLE "pedidos_assinatura" ADD COLUMN "meio" TEXT;            -- pix | cartao_credito
ALTER TABLE "pedidos_assinatura" ADD COLUMN "parcelas" INTEGER;
ALTER TABLE "pedidos_assinatura" ADD COLUMN "totalPago" DECIMAL(12,2); -- com juros do parcelamento, se houver
ALTER TABLE "pedidos_assinatura" ADD COLUMN "estornadoEm" TIMESTAMPTZ(3);
ALTER TABLE "pedidos_assinatura" ADD COLUMN "numeroRecibo" SERIAL;   -- número sequencial legível no recibo
```

- `cumprir()` passa a receber o pagamento do Mercado Pago inteiro (ou `{ meio, parcelas, totalPago }`) em vez
  de só o id. `meioDoPagamento()` já existe em `src/lib/eventos-pagamento.ts`.
- Script único de preenchimento para os pedidos já pagos: buscar cada `pagamentoId` no Mercado Pago e completar
  `meio`, `parcelas` e `totalPago`.

Corrigir junto: `valorMensal` do plano anual deve ser `precoAnual / 12` (hoje grava o preço mensal), para o
Financeiro do painel mostrar a receita mensal certa.

### B.2 API
| Método | Rota | Quem | Retorno |
|---|---|---|---|
| GET | `/assinatura/clinica/pagamentos` | administrador (sessão) | Lista: data, plano, ciclo, valor, meio, parcelas, período coberto, status, número do recibo |
| GET | `/assinatura/clinica/pagamentos/:id/recibo` | administrador (sessão) | HTML pronto para imprimir/salvar em PDF |

- Mostrar pedidos `pago` e `estornado` (estornado com o rótulo "Devolvido"). Não mostrar pendentes.
- Recibo: dados da clínica (razão social, CNPJ), dados de quem recebe (J.A. Clinics, CNPJ — **pergunta em
  aberto**), plano, período, valor, meio, número do pagamento no Mercado Pago e número do recibo.
  O recibo **não substitui a nota fiscal**; se a NFS-e for implementada, linkar a nota aqui.

### B.3 Web-app
- Configurações › Assinatura ganha a seção **Histórico de pagamentos**: tabela (data, descrição, meio,
  valor, status) e botão **Recibo** (abre em nova aba e chama `window.print()`).
- Estado vazio: "Os pagamentos feitos pelo Mercado Pago aparecem aqui."

### B.4 Painel interno
- **Ficha da clínica** (`/clinicas/[id]`): bloco "Pagamentos" com a mesma lista, total pago desde o início
  e link "Ver no Logs" (filtra os eventos pela clínica).
- **Página nova `/pagamentos`**: todos os pagamentos de todas as clínicas, filtro por período, meio, status e
  plano, totais no rodapé e **exportar CSV** (para a contabilidade).
- Financeiro (`/`): usar os pedidos pagos do mês para "Recebido no mês" das assinaturas.

### B.5 Aceite
- [ ] Cada pagamento confirmado aparece no histórico da clínica e no painel com meio e parcelas certos.
- [ ] Estorno aparece como "Devolvido" com a data.
- [ ] Recibo imprime numa página A4 legível, com número sequencial.
- [ ] CSV do painel abre no Excel com acentos e valores corretos (separador `;`, BOM UTF-8).

---

## C. Troca de plano no meio do período

### C.1 Regras
Mesmo ciclo, clínica **em dia** (`situacao = 'em_dia'`):

| Caso | O que acontece |
|---|---|
| **Upgrade** (plano mais caro) | Cobra só a diferença proporcional aos dias que faltam. O plano muda assim que o pagamento é confirmado. **O vencimento não muda.** |
| **Downgrade** (plano mais barato) | Não cobra nem devolve. Fica **agendado** para o próximo vencimento. Na renovação, cobra o preço do plano novo. |

Troca de **ciclo** (mensal ↔ anual):
- O novo ciclo começa **agora**. O que sobra do período atual vira **crédito**, descontado do valor do novo ciclo.
- Exemplo: pagou o mensal Profissional (319,90), faltam 10 de 30 dias → crédito de 106,63 → o anual de
  3.838,80 sai por 3.732,17 e vale por 12 meses a partir de hoje.

Outros casos:
- **Atrasada ou bloqueada:** não há proporcional. Paga o período cheio do plano escolhido (como hoje).
- **Teste grátis:** como hoje (os dias do teste somam ao primeiro período).
- **Valor mínimo:** diferença abaixo de R$ 5,00 → troca sem cobrança.
- **Limites:** o upgrade é sempre permitido. Downgrade agendado: avisar na hora se a clínica tem mais usuários
  ou unidades que o plano novo permite (`assertClinicaCabeNoPlano`), e conferir de novo no vencimento; se ainda
  não couber, manter o plano atual e avisar por e-mail.

Fórmula (função pura em `src/lib/assinatura.ts`, com testes):

```ts
calcularTrocaDePlano({ planoAtual, cicloAtual, planoNovo, cicloNovo, pagoAte, periodoInicio, agora }):
  | { tipo: 'upgrade'; valor: number; mantemVencimento: true }
  | { tipo: 'troca_ciclo'; valor: number; credito: number; novoInicio: Date; novoFim: Date }
  | { tipo: 'downgrade_agendado'; aPartirDe: Date }
  | { tipo: 'sem_custo' }
  | { tipo: 'periodo_cheio'; valor: number }   // atrasada, bloqueada ou teste

// proporção = (pagoAte - agora) / (pagoAte - periodoInicio), arredondada por dia
// upgrade:     (preçoNovo - preçoAtual) × proporção
// troca ciclo: preçoNovoCiclo - (valorPagoNoPeríodoAtual × proporção)
```

`periodoInicio` sai do último pedido pago da clínica (`pedidos_assinatura.periodoInicio`).

### C.2 Dados
```sql
ALTER TABLE "clinicas" ADD COLUMN "planoAgendadoId" UUID;    -- downgrade que vale no próximo vencimento
ALTER TABLE "clinicas" ADD COLUMN "cicloAgendado" TEXT;
ALTER TABLE "pedidos_assinatura" ADD COLUMN "planoAnteriorCodigo" TEXT;
ALTER TABLE "pedidos_assinatura" ADD COLUMN "credito" DECIMAL(12,2);
-- tipo ganha o valor 'troca_plano'
```

**Atenção ao estorno:** hoje `estornarPedido` recua `pagoAte` pelo tamanho do período do pedido. Num pedido
`troca_plano` de upgrade isso estaria errado, porque o vencimento não mudou. Para `tipo = 'troca_plano'`:
- **upgrade:** o estorno volta o plano para `planoAnteriorCodigo` e não mexe no vencimento;
- **troca de ciclo:** o estorno volta plano, ciclo e `pagoAte` para o que eram antes. Guardar o `pagoAte` anterior
  em `detalhes` do evento ou numa coluna `pagoAteAnterior`.

### C.3 API
| Método | Rota | Uso |
|---|---|---|
| GET | `/assinatura/clinica/simular-troca?plano=&ciclo=` | Mostra quanto paga agora, o que acontece com o vencimento e o aviso de limites |
| POST | `/assinatura/clinica/trocar-plano` | Upgrade e troca de ciclo: abre o checkout com o valor calculado. Downgrade: só agenda e responde 200 |
| DELETE | `/assinatura/clinica/troca-agendada` | Cancela um downgrade agendado |

O valor é **sempre recalculado no servidor** na hora do checkout e de novo na confirmação. Se o vencimento
tiver mudado nesse meio-tempo (por exemplo, outro pagamento entrou), o pedido vai para `revisao`.

Na renovação (`cumprirClinicaExistente`), se houver `planoAgendadoId`, aplicar e limpar o agendamento.

### C.4 Web-app
- Em Configurações › Assinatura, ao escolher um plano ou ciclo diferente do atual, mostrar o resumo da simulação
  antes do botão: "Você paga R$ 42,10 agora e o plano muda na hora. O vencimento continua em 10/11." ou
  "O plano Essencial passa a valer em 10/11. Nada é cobrado agora."
- Mostrar "Troca agendada para dd/mm" com o botão **Cancelar troca**.

### C.5 Aceite
- [ ] Upgrade no meio do mês cobra o proporcional, troca o plano e mantém o vencimento.
- [ ] Downgrade não cobra, fica agendado e vale na renovação com o preço novo.
- [ ] Mensal → anual com crédito correto; o vencimento passa a ser 12 meses a partir de hoje.
- [ ] Estorno de um upgrade devolve o plano anterior sem mexer no vencimento.
- [ ] Testes unitários de `calcularTrocaDePlano` cobrindo bordas (último dia, valor mínimo, meses de 28/31 dias).

---

## A. Cobrança automática no cartão (ativar e desativar)

### A.1 Como funciona no Mercado Pago
Assinatura **sem plano associado** (`preapproval`), **com pagamento pendente**: a API cria a assinatura e
devolve um link; o administrador abre o link e autoriza o cartão no Mercado Pago. A partir daí, o Mercado Pago
cobra sozinho na frequência definida.

```http
POST https://api.mercadopago.com/preapproval
{
  "reason": "J.A. Clinics — Plano Profissional (mensal)",
  "external_reference": "<id da assinatura_recorrente>",
  "payer_email": "<e-mail do administrador>",
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",          // anual: frequency 12
    "start_date": "<pagoAte atual da clínica>",
    "transaction_amount": 319.90,
    "currency_id": "BRL"
  },
  "back_url": "<FRONTEND_URL>/configuracoes/assinatura",
  "status": "pending"
}
```

Pontos a **confirmar no sandbox** antes de codar (a documentação não é explícita):
- se `start_date` futuro funciona como esperado (primeira cobrança só no vencimento atual, sem cobrar em dobro);
- os campos da resposta (`id`, `init_point`, `status`, `next_payment_date`);
- cancelar/pausar com `PUT /preapproval/{id}` (`status: cancelled | paused | authorized`) e alterar o valor com
  `auto_recurring.transaction_amount`;
- o `external_reference` que chega nos pagamentos gerados pela assinatura;
- com credencial de vendedor de teste, `payer_email` precisa ser o e-mail da compradora de teste.

Comportamento documentado:
- Avisos: ativar os tópicos **`subscription_preapproval`** (criação e mudança de status da assinatura),
  **`subscription_authorized_payment`** (cada cobrança; dados em `GET /authorized_payments/{id}`) e **`payment`**.
- Cobrança recusada: o Mercado Pago tenta de novo **até 4 vezes em 10 dias**. Pode atualizar o cartão sozinho
  ("Card Updater").
- Aceita **só cartão** (sem Pix). O Pix continua no pagamento manual.

### A.2 Regras de produto
- É **opcional**: o administrador ativa e desativa quando quiser em Configurações › Assinatura.
- Ao ativar, a primeira cobrança automática acontece **no vencimento atual** (`start_date = pagoAte`), nunca antes.
  Clínica atrasada ou bloqueada: paga o período agora pelo checkout normal e ativa a automática em seguida.
- Ao desativar: cancela no Mercado Pago, o período já pago continua valendo e os lembretes de pagamento manual
  voltam a valer.
- Com a automática ativa, os lembretes mudam: em vez de "vence em 5 dias", manda **"vamos cobrar R$ X no cartão
  final 1234 em dd/mm"** (D-3). Se a cobrança falhar, manda "a cobrança no cartão falhou, atualize o cartão ou
  pague por Pix". A carência de 5 dias e o bloqueio continuam iguais.
- Troca de plano com a automática ativa: upgrade → cobrança proporcional avulsa (checkout) e **atualizar o valor
  da assinatura** no Mercado Pago. Downgrade agendado → atualizar o valor na data do vencimento.
- Mudança de preço dos planos no painel: só afeta as assinaturas automáticas depois de um aviso por e-mail
  (sugestão: 30 dias antes). Atualizar o valor via API em lote.

### A.3 Dados
```sql
CREATE TABLE "assinaturas_recorrentes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicaId" UUID NOT NULL,
  "preapprovalId" TEXT,                       -- id da assinatura no Mercado Pago
  "status" TEXT NOT NULL DEFAULT 'pendente',  -- pendente | ativa | pausada | cancelada
  "planoCodigo" TEXT NOT NULL,
  "ciclo" TEXT NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "cartaoFinal" TEXT,
  "proximaCobrancaEm" TIMESTAMPTZ(3),
  "ativadaPor" UUID,                          -- usuário administrador
  "canceladaEm" TIMESTAMPTZ(3),
  "motivoCancelamento" TEXT,                  -- usuario | painel | mercadopago | falhas
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assinaturas_recorrentes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assinaturas_recorrentes_preapprovalId_key" ON "assinaturas_recorrentes"("preapprovalId");
-- no máximo uma assinatura não cancelada por clínica
CREATE UNIQUE INDEX "assinaturas_recorrentes_ativa_key" ON "assinaturas_recorrentes"("clinicaId")
  WHERE "status" <> 'cancelada';

ALTER TABLE "pedidos_assinatura" ADD COLUMN "assinaturaRecorrenteId" UUID;
CREATE INDEX "pedidos_assinatura_assinaturaRecorrenteId_idx" ON "pedidos_assinatura"("assinaturaRecorrenteId");
```

Cada cobrança automática aprovada vira um **pedido** em `pedidos_assinatura` (`tipo = 'recorrente'`, com
`assinaturaRecorrenteId`). Assim ela reaproveita `registrarPagamentoClinica`, o cálculo de período, o estorno,
o histórico (B) e os Logs, sem um caminho paralelo.

### A.4 API e aviso
| Método | Rota | Uso |
|---|---|---|
| POST | `/assinatura/clinica/automatica` | Cria o preapproval e devolve o `init_point` para o administrador autorizar o cartão |
| DELETE | `/assinatura/clinica/automatica` | Cancela no Mercado Pago e marca `cancelada` |
| GET | `/assinatura/clinica` | Passa a incluir `automatica: { status, cartaoFinal, proximaCobrancaEm, valor } \| null` |

Webhook (`webhookMercadoPago`), hoje só trata `payment`. Passa a tratar também:
- `subscription_preapproval` → `GET /preapproval/{id}` → atualizar `status`, `cartaoFinal` e `proximaCobrancaEm`.
- `subscription_authorized_payment` → `GET /authorized_payments/{id}` → se aprovado, criar o pedido `recorrente`
  e confirmar; se recusado, evento `cobranca_automatica_recusada` (aviso) e e-mail para atualizar o cartão.
- Idempotência pelo id do pagamento (já é único em `pedidos_assinatura.pagamentoId`).

A conferência periódica da fase 1 também confere as assinaturas ativas (`GET /preapproval/search`) uma vez por dia.

### A.5 Web-app
Em Configurações › Assinatura, um cartão **Cobrança automática**:
- Desligada: "Pague todo mês sem se preocupar. Cobramos no cartão no dia do vencimento." + **Ativar**.
- Pendente: "Falta autorizar o cartão no Mercado Pago." + **Continuar** (abre o `init_point` de novo).
- Ativa: "Próxima cobrança: R$ 319,90 em 10/11 no cartão final 1234." + **Desativar** (com confirmação).
- Falhou: "A cobrança de 10/11 não passou. O Mercado Pago tenta de novo nos próximos dias." + **Pagar agora**
  (Pix ou cartão avulso) e **Trocar cartão**.

### A.6 Painel interno
- Lista de clínicas: selo "Automática" na coluna de cobrança.
- Ficha da clínica: status da automática, cartão final, próxima cobrança e o botão **Cancelar automática**
  (registra `motivoCancelamento = 'painel'`).
- Logs: eventos novos `automatica_ativada`, `automatica_cancelada`, `cobranca_automatica_aprovada`,
  `cobranca_automatica_recusada`.

### A.7 Aceite (no sandbox, com a Buyer Test User)
- [ ] Ativar com a clínica em dia: o cartão é autorizado e nada é cobrado antes do vencimento.
- [ ] No vencimento (simular com `start_date` próximo), a cobrança automática aprovada estende `pagoAte` e
      aparece no histórico e em Logs.
- [ ] Cobrança recusada: aviso no sistema, e-mail de "atualize o cartão" e carência normal.
- [ ] Desativar: cancelado no Mercado Pago, o período pago continua e os lembretes manuais voltam.
- [ ] Nunca há duas assinaturas ativas para a mesma clínica.

---

## Variáveis de ambiente
Nenhuma nova obrigatória. Na configuração do webhook do Mercado Pago (aplicação da conta vendedora), marcar
também os eventos **Planos e assinaturas** (`subscription_preapproval`, `subscription_authorized_payment`).

## Perguntas em aberto
- Dados de quem emite o recibo (razão social e CNPJ da J.A. Clinics).
- A NFS-e entra antes desta fase? Se sim, o histórico mostra o link da nota no lugar do recibo.
- Cobrança automática também no **anual** ou só no mensal?
- Desconto para quem ativa a cobrança automática (incentivo)?
- Prazo de aviso para mudança de preço nas assinaturas automáticas (sugestão: 30 dias).
- No downgrade agendado que não cabe nos limites, manter o plano atual cobrando o preço dele ou bloquear
  até a clínica se ajustar?

## Referências
- Mercado Pago, assinaturas sem plano com pagamento pendente:
  https://www.mercadopago.com.br/developers/en/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- Mercado Pago, assinaturas com pagamento autorizado (novas tentativas e Card Updater):
  https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments
- Mercado Pago, notificações (tópicos de assinatura):
  https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/additional-info

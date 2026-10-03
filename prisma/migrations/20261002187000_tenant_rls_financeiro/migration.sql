ALTER TABLE "cobrancas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cobrancas" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "cobrancas"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "despesas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "despesas" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "despesas"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "lotes_convenio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lotes_convenio" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "lotes_convenio"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "comissoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comissoes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "comissoes"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "parcelas_cobranca" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parcelas_cobranca" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "parcelas_cobranca"
  USING (
    app_modo_sistema() OR EXISTS (SELECT 1 FROM "cobrancas" c WHERE c."id" = "cobrancaId")
  )
  WITH CHECK (
    app_modo_sistema() OR EXISTS (SELECT 1 FROM "cobrancas" c WHERE c."id" = "cobrancaId")
  );

ALTER TABLE "lote_guias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lote_guias" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "lote_guias"
  USING (
    app_modo_sistema() OR (
      EXISTS (SELECT 1 FROM "lotes_convenio" l WHERE l."id" = "loteId") AND
      EXISTS (SELECT 1 FROM "cobrancas" c WHERE c."id" = "cobrancaId")
    )
  )
  WITH CHECK (
    app_modo_sistema() OR (
      EXISTS (SELECT 1 FROM "lotes_convenio" l WHERE l."id" = "loteId") AND
      EXISTS (SELECT 1 FROM "cobrancas" c WHERE c."id" = "cobrancaId")
    )
  );

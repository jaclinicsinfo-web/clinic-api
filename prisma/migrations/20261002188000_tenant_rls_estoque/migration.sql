ALTER TABLE "produtos_estoque" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "produtos_estoque" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "produtos_estoque"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "movimentacoes_estoque" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimentacoes_estoque" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "movimentacoes_estoque"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

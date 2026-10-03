ALTER TABLE "notificacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notificacoes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "notificacoes"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

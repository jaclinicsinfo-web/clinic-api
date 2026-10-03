ALTER TABLE "integracoes_clinica" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integracoes_clinica" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "integracoes_clinica"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "regras_lembrete" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regras_lembrete" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "regras_lembrete"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "templates_mensagem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "templates_mensagem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "templates_mensagem"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "custos_envio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custos_envio" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "custos_envio"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "envios_lembrete" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "envios_lembrete" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "envios_lembrete"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

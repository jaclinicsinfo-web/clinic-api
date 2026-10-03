ALTER TABLE "agendamentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agendamentos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "agendamentos"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "bloqueios_agenda" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bloqueios_agenda" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "bloqueios_agenda"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "lista_espera" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lista_espera" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "lista_espera"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

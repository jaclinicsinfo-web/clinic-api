ALTER TABLE "registros_ponto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registros_ponto" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "registros_ponto"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "holerites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holerites" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "holerites"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

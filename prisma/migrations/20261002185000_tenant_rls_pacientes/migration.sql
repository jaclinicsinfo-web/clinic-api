ALTER TABLE "pacientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pacientes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "pacientes"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "acompanhamentos_clinicos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acompanhamentos_clinicos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "acompanhamentos_clinicos"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "atendimentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atendimentos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "atendimentos"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "documentos_paciente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documentos_paciente" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "documentos_paciente"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "logs_acesso_prontuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logs_acesso_prontuario" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento ON "logs_acesso_prontuario"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

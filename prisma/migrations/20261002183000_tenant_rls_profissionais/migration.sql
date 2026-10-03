ALTER TABLE "profissionais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profissionais" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "profissionais"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "profissional_horarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profissional_horarios" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "profissional_horarios"
  USING (
    app_modo_sistema() OR EXISTS (SELECT 1 FROM "profissionais" p WHERE p."id" = "profissionalId")
  )
  WITH CHECK (
    app_modo_sistema() OR EXISTS (SELECT 1 FROM "profissionais" p WHERE p."id" = "profissionalId")
  );

ALTER TABLE "profissional_procedimentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profissional_procedimentos" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "profissional_procedimentos"
  USING (
    app_modo_sistema() OR (
      EXISTS (SELECT 1 FROM "profissionais" p WHERE p."id" = "profissionalId") AND
      EXISTS (SELECT 1 FROM "procedimentos" pr WHERE pr."id" = "procedimentoId")
    )
  )
  WITH CHECK (
    app_modo_sistema() OR (
      EXISTS (SELECT 1 FROM "profissionais" p WHERE p."id" = "profissionalId") AND
      EXISTS (SELECT 1 FROM "procedimentos" pr WHERE pr."id" = "procedimentoId")
    )
  );

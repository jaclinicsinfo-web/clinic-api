ALTER TABLE "convenios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "convenios" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "convenios"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "convenio_procedimentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "convenio_procedimentos" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "convenio_procedimentos"
  USING (
    app_modo_sistema() OR (
      EXISTS (SELECT 1 FROM "convenios" c WHERE c."id" = "convenioId") AND
      EXISTS (SELECT 1 FROM "procedimentos" pr WHERE pr."id" = "procedimentoId")
    )
  )
  WITH CHECK (
    app_modo_sistema() OR (
      EXISTS (SELECT 1 FROM "convenios" c WHERE c."id" = "convenioId") AND
      EXISTS (SELECT 1 FROM "procedimentos" pr WHERE pr."id" = "procedimentoId")
    )
  );

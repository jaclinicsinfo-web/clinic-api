ALTER TABLE "clinicas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinicas" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "clinicas"
  USING      (app_modo_sistema() OR "id" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "id" = app_clinica_atual());

ALTER TABLE "unidades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unidades" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "unidades"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "usuarios"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "perfis_acesso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "perfis_acesso" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "perfis_acesso"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "usuarios_unidades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios_unidades" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "usuarios_unidades"
  USING (
    app_modo_sistema() OR (
      EXISTS (SELECT 1 FROM "usuarios" u WHERE u."id" = "usuarioId") AND
      EXISTS (SELECT 1 FROM "unidades" un WHERE un."id" = "unidadeId")
    )
  )
  WITH CHECK (
    app_modo_sistema() OR (
      EXISTS (SELECT 1 FROM "usuarios" u WHERE u."id" = "usuarioId") AND
      EXISTS (SELECT 1 FROM "unidades" un WHERE un."id" = "unidadeId")
    )
  );

ALTER TABLE "recuperacoes_senha" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recuperacoes_senha" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "recuperacoes_senha"
  USING (
    app_modo_sistema() OR EXISTS (SELECT 1 FROM "usuarios" u WHERE u."id" = "usuarioId")
  )
  WITH CHECK (
    app_modo_sistema() OR EXISTS (SELECT 1 FROM "usuarios" u WHERE u."id" = "usuarioId")
  );

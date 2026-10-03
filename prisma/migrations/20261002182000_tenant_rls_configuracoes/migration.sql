ALTER TABLE "procedimentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procedimentos" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "procedimentos"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

ALTER TABLE "formas_pagamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "formas_pagamento" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolamento ON "formas_pagamento"
  USING      (app_modo_sistema() OR "clinicaId" = app_clinica_atual())
  WITH CHECK (app_modo_sistema() OR "clinicaId" = app_clinica_atual());

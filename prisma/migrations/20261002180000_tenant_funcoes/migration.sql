CREATE OR REPLACE FUNCTION app_clinica_atual() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.clinica_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_modo_sistema() RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.modo_sistema', true), '') = 'on'
$$;

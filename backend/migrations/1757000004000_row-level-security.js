// Row-Level Security como SEGUNDA trava de isolamento de tenant (ADR-012).
//
// Em toda tabela com coluna empresa_id: política que só deixa passar linhas da
// empresa do contexto da requisição. O contexto é o parâmetro de sessão
// app.empresa_id, definido pelo backend a cada checkout de conexão (shared/db.js,
// só quando RLS_ENABLED=true e o perfil é central_admin/loja/motoboy).
//
// SEM contexto (parâmetro vazio) a política deixa tudo passar: migrations, cron,
// login, super_admin e esta própria migration não são afetados. Ou seja: aplicar
// esta migração NÃO muda comportamento até o backend ligar RLS_ENABLED.
//
// FORCE ROW LEVEL SECURITY: a política vale também para o dono da tabela (o
// usuário da aplicação normalmente é o dono).
exports.shorthands = undefined;

// Expressão da política (mesma para USING e WITH CHECK).
const CONDICAO = "coalesce(current_setting('app.empresa_id', true), '') = '' OR empresa_id IS NULL OR empresa_id::text = current_setting('app.empresa_id', true)";

exports.up = (pgm) => {
  pgm.sql(`
  DO $$
  DECLARE t record;
  BEGIN
    FOR t IN
      SELECT c.table_name
        FROM information_schema.columns c
        JOIN pg_class pc ON pc.relname = c.table_name AND pc.relnamespace = 'public'::regnamespace
       WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id'
         AND pc.relkind IN ('r', 'p')
         AND c.table_name NOT LIKE 'rastreamento\\_%'
    LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolamento ON %I', t.table_name);
      EXECUTE format('CREATE POLICY tenant_isolamento ON %I FOR ALL USING (%s) WITH CHECK (%s)', t.table_name, $c$${CONDICAO}$c$, $c$${CONDICAO}$c$);
    END LOOP;
  END $$;`);
};

exports.down = (pgm) => {
  pgm.sql(`
  DO $$
  DECLARE t record;
  BEGIN
    FOR t IN SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolamento' AND schemaname = 'public'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolamento ON %I', t.tablename);
      EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t.tablename);
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
  END $$;`);
};

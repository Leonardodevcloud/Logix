// rastreamento → particionada por DIA (RANGE em capturado_em).
//
// Por quê: 1.000 motoboys online ≈ 3–6 M linhas/dia. Com retenção de 30 dias o
// DELETE diário em 100 M+ linhas trava vacuum e gera bloat. Com partições, a
// retenção vira DROP TABLE da partição do dia (instantâneo, sem bloat).
//
// Como: cria a tabela particionada ao lado, copia os dados, troca os nomes. A
// tabela antiga fica como rastreamento_legado por segurança (é removida na
// migração seguinte, depois de validar em produção).
//
// ⚠ Bloqueia ESCRITAS em rastreamento durante a cópia (leituras seguem). Para o
// volume atual leva segundos. Se a tabela passar de ~5 M linhas antes de rodar,
// use o procedimento em lotes descrito em DEPLOY-sprint3.md em vez desta migração.
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
  DO $$
  DECLARE
    ja_particionada boolean;
    d_ini date; d_fim date; d date;
  BEGIN
    SELECT relkind = 'p' INTO ja_particionada FROM pg_class WHERE relname = 'rastreamento' AND relnamespace = 'public'::regnamespace;
    IF ja_particionada THEN RAISE NOTICE 'rastreamento já é particionada'; RETURN; END IF;

    LOCK TABLE rastreamento IN EXCLUSIVE MODE;

    CREATE TABLE rastreamento_part (
      id           BIGINT NOT NULL DEFAULT nextval('rastreamento_id_seq'),
      motoboy_id   UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      entrega_id   UUID REFERENCES entregas(id) ON DELETE SET NULL,
      lat          NUMERIC(9,6) NOT NULL,
      lng          NUMERIC(9,6) NOT NULL,
      precisao_m   NUMERIC(7,1),
      velocidade   NUMERIC(5,1),
      capturado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id, capturado_em)
    ) PARTITION BY RANGE (capturado_em);

    -- Partição "default" pega qualquer timestamp fora das diárias (nunca perde ping).
    CREATE TABLE rastreamento_default PARTITION OF rastreamento_part DEFAULT;

    -- Partições diárias cobrindo o histórico existente até 7 dias à frente.
    SELECT coalesce(min(capturado_em)::date, current_date) INTO d_ini FROM rastreamento;
    d_fim := current_date + 7;
    d := d_ini;
    WHILE d <= d_fim LOOP
      EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF rastreamento_part FOR VALUES FROM (%L) TO (%L)',
                     'rastreamento_' || to_char(d, 'YYYYMMDD'), d::timestamptz, (d + 1)::timestamptz);
      d := d + 1;
    END LOOP;

    INSERT INTO rastreamento_part (id, motoboy_id, entrega_id, lat, lng, capturado_em)
    SELECT id, motoboy_id, entrega_id, lat, lng, capturado_em FROM rastreamento;

    ALTER INDEX IF EXISTS idx_rastreamento_motoboy_tempo RENAME TO idx_rastreamento_legado_motoboy_tempo;
    ALTER TABLE rastreamento RENAME TO rastreamento_legado;
    ALTER TABLE rastreamento_part RENAME TO rastreamento;
    ALTER SEQUENCE rastreamento_id_seq OWNED BY rastreamento.id;

    CREATE INDEX idx_rastreamento_motoboy_tempo ON rastreamento (motoboy_id, capturado_em DESC);
    CREATE INDEX idx_rastreamento_entrega_tempo ON rastreamento (entrega_id, capturado_em) WHERE entrega_id IS NOT NULL;
  END $$;`);
};

exports.down = (pgm) => {
  // Volta para a tabela simples (só se a legado ainda existir).
  pgm.sql(`
  DO $$
  BEGIN
    IF to_regclass('rastreamento_legado') IS NULL THEN RAISE EXCEPTION 'rastreamento_legado não existe; down não é possível'; END IF;
    INSERT INTO rastreamento_legado (id, motoboy_id, entrega_id, lat, lng, capturado_em)
    SELECT id, motoboy_id, entrega_id, lat, lng, capturado_em FROM rastreamento r
     WHERE NOT EXISTS (SELECT 1 FROM rastreamento_legado l WHERE l.id = r.id);
    ALTER SEQUENCE rastreamento_id_seq OWNED BY NONE;
    DROP TABLE rastreamento;
    ALTER TABLE rastreamento_legado RENAME TO rastreamento;
    ALTER INDEX IF EXISTS idx_rastreamento_legado_motoboy_tempo RENAME TO idx_rastreamento_motoboy_tempo;
    ALTER SEQUENCE rastreamento_id_seq OWNED BY rastreamento.id;
  END $$;`);
};

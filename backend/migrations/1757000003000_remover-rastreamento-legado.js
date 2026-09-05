// Remove rastreamento_legado (cópia da tabela antes do particionamento, mantida
// por segurança na migração 0002). Só roda se a particionada existir e tiver dados.
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
  DO $$
  DECLARE particionada boolean; n bigint;
  BEGIN
    SELECT relkind = 'p' INTO particionada FROM pg_class WHERE relname = 'rastreamento' AND relnamespace = 'public'::regnamespace;
    IF NOT coalesce(particionada, false) THEN RAISE EXCEPTION 'rastreamento não está particionada; não remover a legado'; END IF;
    IF to_regclass('rastreamento_legado') IS NULL THEN RAISE NOTICE 'rastreamento_legado já não existe'; RETURN; END IF;
    SELECT count(*) INTO n FROM rastreamento;
    IF n = 0 AND (SELECT count(*) FROM rastreamento_legado) > 0 THEN
      RAISE EXCEPTION 'particionada vazia mas legado tem dados — cópia não aconteceu; não remover';
    END IF;
    DROP TABLE rastreamento_legado;
  END $$;`);
};

exports.down = () => {
  // Irreversível por definição (a cópia legada foi descartada). O histórico vive na particionada.
};

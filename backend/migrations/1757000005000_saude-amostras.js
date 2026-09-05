// Tela "Saúde do sistema": amostras por minuto de cada réplica + últimos erros 5xx.
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS saude_amostras (
      id         BIGSERIAL PRIMARY KEY,
      instancia  TEXT NOT NULL,
      em         TIMESTAMPTZ NOT NULL DEFAULT now(),
      dados      JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saude_amostras_em ON saude_amostras (em DESC);
    CREATE INDEX IF NOT EXISTS idx_saude_amostras_inst_em ON saude_amostras (instancia, em DESC);

    CREATE TABLE IF NOT EXISTS saude_erros (
      id          BIGSERIAL PRIMARY KEY,
      em          TIMESTAMPTZ NOT NULL DEFAULT now(),
      status      INT NOT NULL,
      rota        TEXT,
      req_id      TEXT,
      empresa_id  UUID,
      mensagem    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_saude_erros_em ON saude_erros (em DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS saude_erros; DROP TABLE IF EXISTS saude_amostras;`);
};

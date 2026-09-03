const { query } = require('../../shared/db');

// Uso das APIs externas, agregado por (provedor, operação, empresa, dia).
// chamadas = hits reais (billáveis); cache = servidas do cache (custo zero).
// empresa_id usa um UUID-zero como sentinela para "sem cliente / sistema"
// (PK exige NOT NULL; NULL em UNIQUE seria tratado como distinto).
async function initApiUsoTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS api_uso (
      provedor    TEXT NOT NULL,
      operacao    TEXT NOT NULL,
      empresa_id  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
      dia         DATE NOT NULL,
      chamadas    BIGINT NOT NULL DEFAULT 0,
      cache       BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (provedor, operacao, empresa_id, dia)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_api_uso_dia ON api_uso (dia)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_api_uso_empresa ON api_uso (empresa_id)`);

  // Preço por 1.000 chamadas reais (editável na tela). Cache nunca custa.
  await query(`
    CREATE TABLE IF NOT EXISTS api_uso_preco (
      provedor       TEXT NOT NULL,
      operacao       TEXT NOT NULL,
      preco_por_mil  NUMERIC(10,4) NOT NULL DEFAULT 0,
      moeda          TEXT NOT NULL DEFAULT 'BRL',
      PRIMARY KEY (provedor, operacao)
    )
  `);

  // Defaults (placeholders — ajuste na tela). Só insere se não existir.
  const seed = [
    ['ors', 'geocoding', 0],
    ['ors', 'optimization', 0],
    ['ors', 'directions', 0],
    ['google', 'geocoding', 25],
  ];
  for (const [prov, op, preco] of seed) {
    await query(
      `INSERT INTO api_uso_preco (provedor, operacao, preco_por_mil)
       VALUES ($1,$2,$3) ON CONFLICT (provedor, operacao) DO NOTHING`,
      [prov, op, preco]
    );
  }
}

module.exports = { initApiUsoTables };

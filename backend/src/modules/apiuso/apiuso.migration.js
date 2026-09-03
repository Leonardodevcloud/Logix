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

  // Preço por 1.000 chamadas reais + franquia grátis mensal (editável na tela).
  // Cache nunca custa; a franquia (ex.: 10.000/mês do Google) é descontada antes do preço.
  await query(`
    CREATE TABLE IF NOT EXISTS api_uso_preco (
      provedor         TEXT NOT NULL,
      operacao         TEXT NOT NULL,
      preco_por_mil    NUMERIC(10,4) NOT NULL DEFAULT 0,
      franquia_gratis  BIGINT NOT NULL DEFAULT 0,
      moeda            TEXT NOT NULL DEFAULT 'BRL',
      PRIMARY KEY (provedor, operacao)
    )
  `);
  await query(`ALTER TABLE api_uso_preco ADD COLUMN IF NOT EXISTS franquia_gratis BIGINT NOT NULL DEFAULT 0`);

  // Defaults com base no mercado (ajuste na tela). google/geocoding: US$5/1.000 ≈ R$25,50
  // e 10.000 grátis/mês. ORS é free-tier/assinatura fixa → 0 por chamada.
  const seed = [
    ['ors', 'geocoding', 0, 0],
    ['ors', 'optimization', 0, 0],
    ['ors', 'directions', 0, 0],
    ['google', 'geocoding', 25.5, 10000],
  ];
  for (const [prov, op, preco, franquia] of seed) {
    await query(
      `INSERT INTO api_uso_preco (provedor, operacao, preco_por_mil, franquia_gratis)
       VALUES ($1,$2,$3,$4) ON CONFLICT (provedor, operacao) DO NOTHING`,
      [prov, op, preco, franquia]
    );
  }
}

module.exports = { initApiUsoTables };

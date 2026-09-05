// Move fotos de protocolo gravadas em BASE64 dentro do Postgres para o storage (R2),
// deixando só a chave na coluna. Roda em lotes, pode ser interrompido e retomado.
//
//   node scripts/migrar-fotos-base64.js --dry-run          # só conta
//   node scripts/migrar-fotos-base64.js --lote 200         # migra 200 por rodada até acabar
//   node scripts/migrar-fotos-base64.js --lote 200 --max 5000
//
// Depois de migrar tudo, recupere o espaço em janela de manutenção:
//   VACUUM (FULL, ANALYZE) protocolos;   -- bloqueia a tabela por alguns segundos/minutos
require('dotenv').config();
const { query, encerrarPool } = require('../src/shared/db');
const storage = require('../src/shared/storage');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const DRY = args.includes('--dry-run');
const LOTE = Number(flag('--lote', 100));
const MAX = Number(flag('--max', Infinity));

function mimeDe(raw) {
  const m = /^data:([^;]+);base64,/.exec(raw); if (m) return m[1];
  if (raw.startsWith('/9j/')) return 'image/jpeg';
  if (raw.startsWith('iVBOR')) return 'image/png';
  if (raw.startsWith('UklG')) return 'image/webp';
  return 'image/jpeg';
}

async function main() {
  if (!storage.storageConfigurado()) throw new Error('STORAGE_* não configurado');
  const { rows: [{ n, bytes }] } = await query(
    `SELECT count(*)::int AS n, coalesce(sum(length(arquivo_url)),0)::bigint AS bytes FROM protocolos
      WHERE arquivo_url IS NOT NULL AND arquivo_url NOT LIKE 'empresas/%' AND arquivo_url NOT LIKE 'http%'`);
  console.log(`[fotos] pendentes: ${n} registros, ${(Number(bytes) / 1048576).toFixed(1)} MB em base64 no banco`);
  if (DRY || !n) { await encerrarPool(); return; }

  let feitos = 0, falhas = 0;
  while (feitos + falhas < Math.min(n, MAX)) {
    const { rows } = await query(
      `SELECT pr.id, pr.arquivo_url, pr.tipo, e.empresa_id, e.motoboy_id
         FROM protocolos pr
         JOIN entregas_pontos ep ON ep.id = pr.entrega_ponto_id
         JOIN entregas e ON e.id = ep.entrega_id
        WHERE pr.arquivo_url IS NOT NULL AND pr.arquivo_url NOT LIKE 'empresas/%' AND pr.arquivo_url NOT LIKE 'http%'
        ORDER BY pr.criado_em LIMIT $1`, [LOTE]);
    if (!rows.length) break;
    const antes = feitos;
    for (const r of rows) {
      try {
        const raw = r.arquivo_url;
        const dataUri = raw.startsWith('data:') ? raw : `data:${mimeDe(raw)};base64,${raw}`;
        const up = await storage.subirBase64({ empresaId: r.empresa_id, motoboyId: r.motoboy_id || r.empresa_id, tipo: 'protocolo', dataUri });
        await query(`UPDATE protocolos SET arquivo_url = $2 WHERE id = $1 AND arquivo_url = $3`, [r.id, up.key, raw]);
        feitos++;
      } catch (e) {
        falhas++;
        console.error(`[fotos] falha em ${r.id}: ${e.message}`);
        // marca para não travar o loop: se falhar sempre, sai após 20 falhas
        if (falhas >= 20) { console.error('[fotos] muitas falhas — abortando'); await encerrarPool(); process.exit(1); }
      }
    }
    console.log(`[fotos] migrados ${feitos}${falhas ? `, falhas ${falhas}` : ''}`);
    if (feitos === antes) { console.error('[fotos] lote inteiro falhou (storage indisponível?) — abortando para não repetir em loop'); await encerrarPool(); process.exit(1); }
  }
  console.log(`[fotos] concluído: ${feitos} migrados. Rode VACUUM (FULL, ANALYZE) protocolos; para recuperar espaço.`);
  await encerrarPool();
}
main().catch(async (e) => { console.error('[fotos] erro:', e.message); await encerrarPool(); process.exit(1); });

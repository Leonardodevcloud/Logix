/* Backfill de distância (km) das entregas concluídas sem distancia_km.
   - Geocodifica a coleta quando coleta_lat/lng estiverem nulos (usa coleta_endereco).
   - Recalcula a distância via haversine (coleta -> pontos) e persiste.
   Idempotente: só toca em entregas com distancia_km nulo ou zero.

   Uso: npm run backfill:km
        DRY_RUN=1 npm run backfill:km   (apenas relatório, não grava) */
require('dotenv').config();
const { query, pool } = require('../src/shared/db');

let geocodificar = null;
try { geocodificar = require('../src/integracoes/openrouteservice').geocodificar; } catch {}

const DRY = process.env.DRY_RUN === '1';

function haversineKm(pts) {
  let km = 0;
  const R = 6371, rad = x => x * Math.PI / 180;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    km += 2 * R * Math.asin(Math.sqrt(h));
  }
  return parseFloat(km.toFixed(2));
}

async function backfill() {
  const { rows: entregas } = await query(
    `SELECT id, protocolo, coleta_lat, coleta_lng, coleta_endereco
     FROM entregas
     WHERE (distancia_km IS NULL OR distancia_km = 0)
     ORDER BY criado_em`
  );

  console.log(`${entregas.length} entrega(s) sem km para processar.${DRY ? ' [DRY-RUN]' : ''}`);
  let geocodadas = 0, calculadas = 0, semCoord = 0;

  for (const e of entregas) {
    let { coleta_lat, coleta_lng, coleta_endereco } = e;

    // 1. Geocodifica a coleta se faltar coordenada.
    if ((!coleta_lat || !coleta_lng) && coleta_endereco && geocodificar) {
      try {
        const g = await geocodificar(coleta_endereco);
        if (g && g.lat && g.lng) {
          coleta_lat = g.lat; coleta_lng = g.lng;
          geocodadas++;
          if (!DRY) {
            await query(
              `UPDATE entregas SET coleta_lat = $1, coleta_lng = $2
               WHERE id = $3 AND (coleta_lat IS NULL OR coleta_lng IS NULL)`,
              [coleta_lat, coleta_lng, e.id]
            );
          }
        }
      } catch (err) {
        console.warn(`  ${e.protocolo}: geocoding falhou (${err.message})`);
      }
    }

    // 2. Coordenadas dos pontos.
    const { rows: pontos } = await query(
      `SELECT lat, lng FROM entregas_pontos WHERE entrega_id = $1 ORDER BY ordem`,
      [e.id]
    );
    const pontosCoord = pontos.filter(p => p.lat && p.lng)
      .map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));

    const origem = (coleta_lat && coleta_lng)
      ? { lat: parseFloat(coleta_lat), lng: parseFloat(coleta_lng) }
      : (pontosCoord[0] || null);

    if (!origem) { semCoord++; continue; }

    const pts = (origem === pontosCoord[0]) ? pontosCoord : [origem, ...pontosCoord];
    if (pts.length < 2) { semCoord++; continue; }

    const km = haversineKm(pts);
    calculadas++;
    console.log(`  ${e.protocolo}: ${km} km`);
    if (!DRY) {
      await query(
        `UPDATE entregas SET distancia_km = $1
         WHERE id = $2 AND (distancia_km IS NULL OR distancia_km = 0)`,
        [km, e.id]
      );
    }
  }

  console.log(`\nResumo: ${calculadas} km calculadas, ${geocodadas} coletas geocodificadas, ${semCoord} sem coordenada suficiente.`);
}

backfill()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });

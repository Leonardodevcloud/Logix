// ─────────────────────────────────────────────────────────────────────────────
// Basemap CENTRAL de todos os mapas do Logix (rastreio, acompanhamento, mapa em
// tempo real). Trocou aqui, valeu em todos. Um lugar só pra manter consistência.
//
// A chave do MapTiler NÃO fica no código. Ela vem do backend, que a lê da env var
// MAPTILER_KEY (definida no Railway). O frontend busca em /mapa/config UMA vez e
// reaproveita. Sem a env definida, cai automaticamente no CARTO Voyager (o atual),
// então nada quebra até você configurar.
//
// COMO ATIVAR O MAPA DENSO (bairros e ruas aparecendo cedo, estilo Google):
//   1. Crie uma conta FREE no MapTiler: https://cloud.maptiler.com  (sem cartão)
//   2. Copie sua API key no painel.
//   3. No Railway, no serviço do BACKEND, adicione a variável de ambiente:
//        MAPTILER_KEY = sua_chave_aqui
//      (e no worker também, se ele precisar — mapa não precisa, então só backend)
//   4. Redeploy do backend. Pronto: os três mapas passam a usar o MapTiler.
//   5. No painel do MapTiler, restrinja a chave ao seu domínio da Vercel.
// ─────────────────────────────────────────────────────────────────────────────

import { get } from './api.js';

// MapTiler "Streets": rótulos densos, multilíngue (PT), ótimo pra logística.
const MAPTILER = (k) => ({
  url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${k}`,
  attribution: '© MapTiler © OpenStreetMap contributors',
  maxZoom: 22,
});
// Fallback sem chave: CARTO Voyager @2x (rotulado, retina).
const VOYAGER = {
  url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
  attribution: '© OpenStreetMap, © CARTO',
  maxZoom: 20,
};

let _keyCache = null;   // null = ainda não buscou; '' = buscou e não tem chave
let _buscando = null;   // promessa em voo (evita buscas paralelas)

async function obterKey() {
  if (_keyCache !== null) return _keyCache;
  if (!_buscando) {
    _buscando = get('/mapa/config')
      .then((r) => { _keyCache = (r && r.maptilerKey) || ''; return _keyCache; })
      .catch(() => { _keyCache = ''; return ''; });
  }
  return _buscando;
}

// Adiciona o basemap a um mapa Leaflet já criado. Assíncrono: busca a chave uma
// vez (do backend) e então aplica a camada de tiles. Se algo falhar, usa Voyager.
export async function aplicarBasemap(mapa, L = window.L) {
  let cfg = VOYAGER;
  try { const key = await obterKey(); if (key) cfg = MAPTILER(key); } catch {}
  L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom, crossOrigin: true }).addTo(mapa);
}

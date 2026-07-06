// ─────────────────────────────────────────────────────────────────────────────
// Basemap CENTRAL de todos os mapas do Logix (rastreio, acompanhamento, mapa em
// tempo real). Trocou aqui, valeu em todos. Um lugar só pra manter consistência.
//
// COMO TER UM MAPA DENSO (bairros e ruas aparecendo cedo, estilo Google):
//   1. Crie uma conta FREE no MapTiler: https://cloud.maptiler.com  (sem cartão)
//   2. Copie sua chave (API key) no painel.
//   3. Cole na constante MAPTILER_KEY abaixo, entre as aspas.
//   4. No painel do MapTiler, restrinja a chave ao seu domínio (Vercel) por
//      segurança — a chave fica visível no frontend, isso é normal em mapas.
//
// Sem chave (MAPTILER_KEY vazio), cai automaticamente no CARTO Voyager (o atual),
// então nada quebra — só não fica mais denso até você colar a chave.
// ─────────────────────────────────────────────────────────────────────────────

const MAPTILER_KEY = ''; // <-- COLE SUA CHAVE FREE DO MAPTILER AQUI

// MapTiler "Streets": rótulos densos, multilíngue (PT), ótimo pra logística.
const MAPTILER = {
  url: (k) => `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${k}`,
  attribution: '© MapTiler © OpenStreetMap contributors',
  maxZoom: 22,
};

// Fallback sem chave: CARTO Voyager @2x (rotulado, retina).
const VOYAGER = {
  url: () => 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
  attribution: '© OpenStreetMap, © CARTO',
  maxZoom: 20,
};

// Adiciona o basemap escolhido a um mapa Leaflet já criado.
export function aplicarBasemap(mapa, L = window.L) {
  const cfg = MAPTILER_KEY ? MAPTILER : VOYAGER;
  L.tileLayer(cfg.url(MAPTILER_KEY), {
    attribution: cfg.attribution,
    maxZoom: cfg.maxZoom,
    crossOrigin: true,
  }).addTo(mapa);
}

export const usandoMapTiler = () => !!MAPTILER_KEY;

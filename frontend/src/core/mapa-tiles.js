// ─────────────────────────────────────────────────────────────────────────────
// Basemap CENTRAL de todos os mapas do Logix (rastreio, acompanhamento, mapa em
// tempo real). Trocou aqui, valeu em todos.
//
// Prioridade do basemap:
//   1) Google Maps  — via GoogleMutant: renderiza o basemap do Google DENTRO do
//      Leaflet, usando a API JavaScript OFICIAL do Google (billing respeitado).
//      Todos os marcadores/rotas/popups do Leaflet continuam funcionando igual.
//   2) MapTiler     — se não houver chave do Google.
//   3) CARTO Voyager— fallback final, sem chave.
//
// As chaves vêm do backend (/mapa/config, que lê env vars no Railway) — nunca
// ficam hardcoded no front.
//
// PARA USAR O GOOGLE:
//   1. No Google Cloud, crie uma chave de navegador (Maps JavaScript API),
//      restrita ao seu domínio (HTTP referrer).
//   2. No Railway (backend), defina a env:  GOOGLE_MAPS_BROWSER_KEY = sua_chave
//   3. Redeploy do backend. Pronto — os 3 mapas passam a usar o Google.
//   (Ative um alerta de orçamento no Google Cloud por segurança.)
// ─────────────────────────────────────────────────────────────────────────────

import { get } from './api.js';

// ── Config do backend (uma vez, cacheada) ──
let _cfgCache = null;
let _cfgPromise = null;
async function obterConfig() {
  if (_cfgCache) return _cfgCache;
  if (!_cfgPromise) {
    _cfgPromise = get('/mapa/config')
      .then((r) => { _cfgCache = r || {}; return _cfgCache; })
      .catch(() => { _cfgCache = {}; return _cfgCache; });
  }
  return _cfgPromise;
}

// ── Loader do Google Maps JS API (uma vez) ──
let _googlePromise = null;
function carregarGoogle(key) {
  if (window.google && window.google.maps) return Promise.resolve();
  if (_googlePromise) return _googlePromise;
  _googlePromise = new Promise((resolve, reject) => {
    const cbName = '__lxGoogleReady';
    window[cbName] = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=${cbName}`;
    s.async = true;
    s.onerror = () => reject(new Error('falha ao carregar Google Maps JS'));
    document.head.appendChild(s);
  });
  return _googlePromise;
}

// ── Loader do plugin GoogleMutant (embutido no repo, uma vez) ──
let _mutantPromise = null;
function carregarMutant() {
  if (window.L && window.L.gridLayer && window.L.gridLayer.googleMutant) return Promise.resolve();
  if (_mutantPromise) return _mutantPromise;
  _mutantPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // Resolve o caminho do arquivo irmão independente de onde o app é servido.
    s.src = new URL('./leaflet-googlemutant.js', import.meta.url).href;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('falha ao carregar GoogleMutant'));
    document.head.appendChild(s);
  });
  return _mutantPromise;
}

const VOYAGER = {
  url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
  attribution: '© OpenStreetMap, © CARTO', maxZoom: 20,
};
const MAPTILER = (k) => ({
  url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${k}`,
  attribution: '© MapTiler © OpenStreetMap contributors', maxZoom: 22,
});

// Beacon: registra 1 carregamento de mapa Google (custo de tiles) por cliente.
// Fire-and-forget: nunca atrapalha o render do mapa.
let _beaconPost = null;
async function beaconMapa() {
  try {
    if (!_beaconPost) { _beaconPost = (await import('./api.js')).post; }
    _beaconPost('/api-uso/beacon', { operacao: 'maptiles' }).catch(() => {});
  } catch (_) {}
}

function tileFallback(mapa, L, key) {
  const cfg = key ? MAPTILER(key) : VOYAGER;
  L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom, crossOrigin: true }).addTo(mapa);
}

// Adiciona o basemap a um mapa Leaflet já criado. Assíncrono: resolve chave +
// carrega o provedor e então aplica a camada. Nunca lança (cai no fallback).
export async function aplicarBasemap(mapa, L = window.L) {
  let cfg = {};
  try { cfg = await obterConfig(); } catch {}

  // 1) Google Maps (preferido) via GoogleMutant
  if (cfg.googleMapsKey) {
    try {
      await Promise.all([carregarGoogle(cfg.googleMapsKey), carregarMutant()]);
      window.L.gridLayer.googleMutant({ type: 'roadmap', maxZoom: 22 }).addTo(mapa);
      try { beaconMapa(); } catch (_) {}
      return;
    } catch (e) {
      // Google falhou (chave/rede) → cai pro tile normal abaixo.
    }
  }

  // 2) MapTiler  3) Voyager
  tileFallback(mapa, L, cfg.maptilerKey || '');
}

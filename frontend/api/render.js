// ─────────────────────────────────────────────────────────────────────────────
//  render.js — serve o HTML do painel com a MARCA DO DOMÍNIO injetada no <head>.
//
//  Por que existe: o WhatsApp/Facebook e o favicon são lidos ANTES do app rodar
//  (robôs não executam JS). Como um único deploy serve vários domínios de cliente,
//  aqui a gente lê o domínio, pega a marca no /branding?host= (que já existe no
//  backend) e devolve o HTML já com título, favicon e Open Graph do cliente.
//
//  ⚠️  Esta função passa a servir TODA navegação do painel. Teste num PREVIEW do
//      Vercel antes de promover pra produção.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND = process.env.BRANDING_API || 'https://logix-production-61ae.up.railway.app/api/v1';
// A API é chamada pelo MESMO domínio do cliente (/bff), e o Vercel repassa pro
// Railway — assim o "railway.app" some do código-fonte (white-label).
const APP_API = '/bff/v1';
// O WebSocket NÃO passa por proxy (Vercel não repassa WS): aponta direto pro backend.
const APP_WS = process.env.LOGIX_WS || 'wss://logix-production-61ae.up.railway.app/ws';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function montarHtml({ nome, desc, cor, corPrim, logo, iniciais, favicon, ogImage, base }) {
  // Preload (tela de carregamento) JÁ com a marca do cliente — evita o flash do
  // "LX" da Logix enquanto o app inicializa. O main.js detecta este #lx-boot e não cria outro.
  const selo = logo
    ? `<img src="${esc(logo)}" alt="" style="width:100%;height:100%;object-fit:contain">`
    : esc(iniciais);
  const preload =
    `<div id="lx-boot" style="position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#eef4fb">` +
      `<div style="width:60px;height:60px;border-radius:15px;background:${esc(corPrim)};color:#fff;display:grid;place-items:center;font-weight:800;font-size:22px;overflow:hidden;box-shadow:0 8px 24px -8px rgba(4,44,83,.4)">${selo}</div>` +
      `<div style="width:26px;height:26px;border:3px solid #cddcec;border-top-color:${esc(corPrim)};border-radius:50%;animation:lxspin .8s linear infinite"></div>` +
    `</div><style>@keyframes lxspin{to{transform:rotate(360deg)}}</style>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(nome)}</title>
  <meta name="description" content="${esc(desc)}">

  <link rel="icon" href="${esc(favicon)}">
  <link rel="apple-touch-icon" href="${esc(favicon)}">
  <link rel="manifest" href="/app.webmanifest">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(nome)}">
  <meta property="og:title" content="${esc(nome)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(base)}/">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:image:secure_url" content="${esc(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="pt_BR">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(nome)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <meta name="theme-color" content="${esc(cor)}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/tokens.css">
  <link rel="stylesheet" href="/assets/componentes.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css">
  <style>body{margin:0}#app{min-height:100vh}</style>
</head>
<body>
  ${preload}
  <div id="app"></div>
  <script>window.LOGIX_API = '${APP_API}'; window.LOGIX_WS = '${APP_WS}';</script>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;
}

export default async function handler(req, res) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  const base = `https://${host}`;

  // Padrão (fallback Logix) caso o domínio não seja de nenhum cliente ou a API falhe.
  let marca = {
    nome_exibicao: 'Logix',
    cor_secundaria: '#042C53',
    favicon_url: null,
    og_image_url: null,
  };
  try {
    const r = await fetch(`${BACKEND}/branding?host=${encodeURIComponent(host)}`, { headers: { accept: 'application/json' } });
    if (r.ok) { const b = await r.json(); if (b && b.nome_exibicao) marca = { ...marca, ...b }; }
  } catch (e) { /* usa o fallback */ }

  const nome = marca.nome_exibicao || 'Logix';
  const desc = `Central de entregas ${nome}. Acompanhe suas corridas em tempo real.`;
  const cor = marca.cor_secundaria || '#042C53';
  const corPrim = marca.cor_primaria || '#185FA5';
  const logo = marca.logo_url || null;
  const iniciais = String(nome).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'LX';
  // Favicon: usa o do cliente; senão, o gerado automaticamente (quadrado) por /api/og.
  const favicon = marca.favicon_url || `${base}/og-image?tipo=favicon`;
  // Card: usa a arte enviada pelo cliente (opção A); senão, gera do logo+cores (opção B).
  const ogImage = marca.og_image_url || `${base}/og-image`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache curto na borda: o robô do WhatsApp e o navegador pegam rápido, e a marca
  // atualiza em até ~5 min se o cliente mudar algo.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(montarHtml({ nome, desc, cor, corPrim, logo, iniciais, favicon, ogImage, base }));
}

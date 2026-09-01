// ─────────────────────────────────────────────────────────────────────────────
//  manifest.js — serve o manifest do PWA (nome, ícone, cores) com a MARCA DO
//  DOMÍNIO. Assim, ao "instalar como app", o cliente vê a marca dele, não "Logix".
//  Servido em /app.webmanifest (ver vercel.json). Usa o /branding?host= existente.
// ─────────────────────────────────────────────────────────────────────────────
const BACKEND = process.env.BRANDING_API || 'https://logix-production-61ae.up.railway.app/api/v1';

export default async function handler(req, res) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();

  let marca = { nome_exibicao: 'Logix', cor_primaria: '#185FA5', cor_secundaria: '#042C53', favicon_url: null };
  try {
    const r = await fetch(`${BACKEND}/branding?host=${encodeURIComponent(host)}`, { headers: { accept: 'application/json' } });
    if (r.ok) { const b = await r.json(); if (b && b.nome_exibicao) marca = { ...marca, ...b }; }
  } catch (e) { /* usa fallback */ }

  const nome = marca.nome_exibicao || 'Logix';
  // Ícone do PWA: favicon do cliente, ou o quadrado gerado automaticamente.
  const icone = marca.favicon_url || `https://${host}/og-image?tipo=favicon`;

  const manifest = {
    name: nome,
    short_name: nome.length > 12 ? nome.split(/\s+/)[0] : nome,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: marca.cor_secundaria || '#042C53',
    theme_color: marca.cor_primaria || '#185FA5',
    icons: [
      { src: icone, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icone, sizes: '256x256', type: 'image/png', purpose: 'any' },
      { src: icone, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(JSON.stringify(manifest));
}

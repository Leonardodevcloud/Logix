// ─────────────────────────────────────────────────────────────────────────────
//  og.js — gera AUTOMATICAMENTE a imagem de card (1200x630) e o favicon (256x256)
//  a partir do logo + cores + nome do cliente, quando ele não subiu uma arte.
//
//  Usa @vercel/og (Satori) na borda. Sem JSX: os elementos são objetos simples.
//  Chamado por /og-image  e  /og-image?tipo=favicon (ver vercel.json).
// ─────────────────────────────────────────────────────────────────────────────
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const BACKEND = 'https://logix-production-61ae.up.railway.app/api/v1';

// Helper pra montar elementos sem JSX (Satori aceita este formato).
const h = (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } });

function iniciais(nome) {
  const p = String(nome || 'Logix').trim().split(/\s+/);
  return ((p[0]?.[0] || 'L') + (p[1]?.[0] || '')).toUpperCase();
}

export default async function handler(req) {
  const url = new URL(req.url);
  const host = String(req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(':')[0].toLowerCase();
  const favicon = url.searchParams.get('tipo') === 'favicon';

  // Resposta com cache FORTE: o Vercel/CDN e o robô do WhatsApp guardam a imagem
  // pronta (1 dia no navegador, 30 dias na borda). Assim o download é instantâneo
  // e o WhatsApp escolhe o card GRANDE (em vez do fallback pequeno).
  const comCache = (img) => {
    img.headers.set('Cache-Control', 'public, immutable, no-transform, max-age=86400, s-maxage=2592000');
    return img;
  };

  let marca = { nome_exibicao: 'Logix', cor_primaria: '#185FA5', cor_secundaria: '#042C53', logo_url: null };
  try {
    const r = await fetch(`${BACKEND}/branding?host=${encodeURIComponent(host)}`, { headers: { accept: 'application/json' } });
    if (r.ok) { const b = await r.json(); if (b) marca = { ...marca, ...b }; }
  } catch (e) { /* usa fallback */ }

  const nome = marca.nome_exibicao || 'Logix';
  const fundo = marca.cor_secundaria || '#042C53';
  const prim = marca.cor_primaria || '#185FA5';
  const logo = marca.logo_url || null;

  // Marca central: logo do cliente, ou o monograma com as iniciais.
  const selo = (px) => logo
    ? h('img', { src: logo, width: px, height: px, style: { objectFit: 'contain' } })
    : h('div', {
        style: {
          width: px, height: px, borderRadius: px * 0.22, background: prim,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: px * 0.42, fontWeight: 900, letterSpacing: '-2px',
          border: '2px solid rgba(255,255,255,0.18)',
        },
      }, iniciais(nome));

  if (favicon) {
    return comCache(new ImageResponse(
      h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: fundo } }, selo(180)),
      { width: 256, height: 256 }
    ));
  }

  // Card 1200x630 — CENTRALIZADO (o WhatsApp recorta as bordas; centralizar garante
  // que logo + nome apareçam inteiros em qualquer recorte). Todos os divs com display:flex.
  const nomeCurto = String(nome).length > 30;
  return comCache(new ImageResponse(
    h('div', {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '60px 80px',
        backgroundColor: fundo,
        color: '#fff', fontFamily: 'sans-serif',
      },
    },
      h('div', { style: { display: 'flex', marginBottom: 30 } }, selo(140)),
      h('div', { style: { display: 'flex', textAlign: 'center', fontSize: nomeCurto ? 52 : 68, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-1px', maxWidth: 1000 } }, nome),
      h('div', { style: { display: 'flex', fontSize: 27, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 22 } },
        'Central de entregas — em tempo real'),
      h('div', { style: { display: 'flex', fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.65)', marginTop: 30, textTransform: 'uppercase', letterSpacing: '1px' } }, host)
    ),
    { width: 1200, height: 630 }
  ));
}

// White-label em runtime (ESM): carrega o branding do tenant e sobrescreve as variáveis do tokens.css.
const MAPA_CORES = {
  cor_primaria: '--lx-azul-primario',
  cor_secundaria: '--lx-azul-profundo',
  cor_destaque: '--lx-azul-vivo',
  cor_clara: '--lx-azul-claro',
};

let _temaAtual = null;

export function aplicarTema(tema) {
  if (tema) _temaAtual = tema;
  tema = tema || _temaAtual;
  if (!tema) return;
  const raiz = document.documentElement;
  for (const [campo, varCss] of Object.entries(MAPA_CORES)) if (tema[campo]) raiz.style.setProperty(varCss, tema[campo]);
  if (tema.cor_secundaria) { raiz.style.setProperty('--lx-navy-900', tema.cor_secundaria); raiz.style.setProperty('--lx-navy-950', tema.cor_secundaria); }
  if (tema.nome_exibicao) document.title = tema.nome_exibicao;
  if (tema.favicon_url) {
    let link = document.querySelector('link[rel~="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = tema.favicon_url;
  }
  document.querySelectorAll('[data-lx-nome]').forEach((e) => { if (tema.nome_exibicao) e.textContent = tema.nome_exibicao; });
  // Logo do tenant: troca o monograma "LX" pela imagem enviada (URL ou base64).
  document.querySelectorAll('[data-lx-logo]').forEach((e) => {
    if (tema.logo_url) {
      e.innerHTML = '';
      e.style.background = 'transparent';
      e.style.padding = '0';
      const img = document.createElement('img');
      img.src = tema.logo_url;
      img.alt = tema.nome_exibicao || 'logo';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain';
      img.onerror = () => { e.textContent = 'LX'; e.style.background = ''; };
      e.appendChild(img);
    }
  });
  document.dispatchEvent(new CustomEvent('logix:tema', { detail: tema }));
}

// Reaplica o tema já carregado — usado quando a sidebar é (re)montada,
// garantindo que logo/nome/cores peguem na DOM nova.
export function reaplicarTema() { if (_temaAtual) aplicarTema(_temaAtual); }

export async function carregarTema({ base = '/api/v1', token } = {}) {
  try {
    const url = token ? base + '/branding/eu' : base + '/branding';
    const resp = await fetch(url, { credentials: 'include', headers: token ? { Authorization: 'Bearer ' + token } : {} });
    const tema = await resp.json();
    aplicarTema(tema);
    return tema;
  } catch (e) {
    console.warn('[tema] falha ao carregar branding:', e.message);
    return null;
  }
}

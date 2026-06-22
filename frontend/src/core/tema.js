// White-label em runtime (ESM): carrega o branding do tenant e sobrescreve as variáveis do tokens.css.
const MAPA_CORES = {
  cor_primaria: '--lx-azul-primario',
  cor_secundaria: '--lx-azul-profundo',
  cor_destaque: '--lx-azul-vivo',
  cor_clara: '--lx-azul-claro',
};

export function aplicarTema(tema) {
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
  document.dispatchEvent(new CustomEvent('logix:tema', { detail: tema }));
}

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

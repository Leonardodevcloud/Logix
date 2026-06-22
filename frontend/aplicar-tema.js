/* =========================================================================
   Logix · White-label — aplicação de tema em runtime
   Carrega o branding do tenant (por host, ou autenticado após login) e
   sobrescreve as variáveis CSS do tokens.css, além de logo, favicon e título.

   Uso:
     // antes do login, pelo domínio/subdomínio:
     LogixTema.carregarTema({ base: 'https://api.logix.com.br/api/v1' });
     // após login, tema do próprio tenant:
     LogixTema.carregarTema({ base, token: meuAccessToken });

   Marcação no HTML:
     <img data-ig-logo>            logo claro
     <img data-ig-logo="escuro">   logo p/ fundos escuros (sidebar)
     <span data-ig-nome></span>    nome de exibição do tenant
     <div  data-ig-powered></div>  bloco "powered by" (some se desativado)
   ========================================================================= */
(function (global) {
  // branding -> variável CSS do tokens.css
  const MAPA_CORES = {
    cor_primaria:   '--lx-azul-primario',
    cor_secundaria: '--lx-azul-profundo',
    cor_destaque:   '--lx-azul-vivo',
    cor_clara:      '--lx-azul-claro',
  };

  function aplicarTema(tema) {
    if (!tema) return;
    const raiz = document.documentElement;

    for (const [campo, varCss] of Object.entries(MAPA_CORES)) {
      if (tema[campo]) raiz.style.setProperty(varCss, tema[campo]);
    }
    // fundo escuro (sidebar/app) deriva da cor secundária do tenant
    if (tema.cor_secundaria) {
      raiz.style.setProperty('--lx-navy-900', tema.cor_secundaria);
      raiz.style.setProperty('--lx-navy-950', tema.cor_secundaria);
    }

    if (tema.nome_exibicao) document.title = tema.nome_exibicao;

    if (tema.favicon_url) {
      let link = document.querySelector('link[rel~="icon"]');
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = tema.favicon_url;
    }

    document.querySelectorAll('[data-ig-logo]').forEach((el) => {
      const usaEscuro = el.getAttribute('data-ig-logo') === 'escuro';
      const url = usaEscuro ? (tema.logo_escuro_url || tema.logo_url) : tema.logo_url;
      if (!url) return;
      if (el.tagName === 'IMG') el.src = url;
      else el.style.backgroundImage = `url("${url}")`;
    });

    document.querySelectorAll('[data-ig-nome]').forEach((el) => {
      if (tema.nome_exibicao) el.textContent = tema.nome_exibicao;
    });

    document.querySelectorAll('[data-ig-powered]').forEach((el) => {
      el.style.display = tema.mostrar_powered_by ? '' : 'none';
    });

    global.__LOGIX_TEMA__ = tema;
    document.dispatchEvent(new CustomEvent('logix:tema', { detail: tema }));
  }

  // opts: { base, host, empresaId, token }
  async function carregarTema(opts = {}) {
    const base = opts.base || '/api/v1';
    let url = `${base}/branding`;
    const headers = {};

    if (opts.token) {
      url = `${base}/branding/eu`;            // tema do tenant autenticado
      headers.Authorization = 'Bearer ' + opts.token;
    } else {
      const params = [];
      if (opts.empresaId) params.push('empresa_id=' + encodeURIComponent(opts.empresaId));
      if (opts.host)      params.push('host=' + encodeURIComponent(opts.host));
      if (params.length)  url += '?' + params.join('&');
    }

    try {
      const resp = await fetch(url, { credentials: 'include', headers });
      const tema = await resp.json();
      aplicarTema(tema);
      return tema;
    } catch (e) {
      console.warn('[tema] falha ao carregar branding:', e.message);
      return null;
    }
  }

  global.LogixTema = { aplicarTema, carregarTema };
})(window);

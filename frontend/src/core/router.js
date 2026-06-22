// Roteador por hash, com módulos carregados sob demanda (import dinâmico) e suporte a :params.
const rotas = new Map();
let saidaEl = null;
let guarda = null;

export function definirSaida(el) { saidaEl = el; }
export function definirGuarda(fn) { guarda = fn; }
export function rota(caminho, carregar) { rotas.set(caminho, carregar); }
export function navegar(caminho) {
  if (location.hash.slice(1) !== caminho) location.hash = caminho; else resolver();
}

function casar(padrao, caminho) {
  const p = padrao.split('/'), c = caminho.split('/');
  if (p.length !== c.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(c[i]);
    else if (p[i] !== c[i]) return null;
  }
  return params;
}

async function resolver() {
  const caminho = location.hash.slice(1) || '/';
  if (guarda) { const destino = guarda(caminho); if (destino && destino !== caminho) return navegar(destino); }

  let carregar = rotas.get(caminho), params = {};
  if (!carregar) {
    for (const [padrao, fn] of rotas) { const m = casar(padrao, caminho); if (m) { carregar = fn; params = m; break; } }
  }
  if (!carregar) { saidaEl.innerHTML = '<p style="padding:40px">Página não encontrada.</p>'; return; }

  const modulo = await carregar();           // cada módulo exporta montar(el, params)
  saidaEl.innerHTML = '';
  await (modulo.montar || modulo.default)(saidaEl, params);
}

export function iniciar() { window.addEventListener('hashchange', resolver); resolver(); }

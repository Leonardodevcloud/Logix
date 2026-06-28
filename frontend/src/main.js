// Bootstrap da aplicação: tema, sessão, rotas.
import * as api from './core/api.js';
import * as auth from './core/auth.js';
import * as router from './core/router.js';
import { carregarTema, aplicarTema } from './core/tema.js';

const BASE = window.LOGIX_API || '/api/v1';

// Tema padrão Logix — aplicado para super_admin e tela de login
const TEMA_PADRAO = {
  cor_primaria:   '#185FA5',
  cor_secundaria: '#042C53',
  cor_destaque:   '#378ADD',
  cor_clara:      '#B5D4F4',
  nome_exibicao:  'logix',
};

function restaurarTemaPadrao() {
  aplicarTema(TEMA_PADRAO);
  document.title = 'logix';
}

async function aplicarTemaDoUsuario() {
  const u = auth.usuarioAtual();
  if (!u) { restaurarTemaPadrao(); return; }

  // Super admin vê sempre o tema padrão Logix (exceto quando impersonando)
  if (u.perfil === 'super_admin' && !auth.estaImpersonando()) {
    restaurarTemaPadrao();
    return;
  }

  // Cliente ou impersonação: carrega o branding do tenant com o token atual
  try {
    const token = api.getToken();
    if (token) await carregarTema({ base: BASE, token });
  } catch { /* silencioso */ }
}

async function boot() {
  const app = document.getElementById('app');
  if (window.LOGIX_API) api.setBase(window.LOGIX_API);
  router.definirSaida(app);

  // Boot: tenta resolver tema pelo host (para domínios white-label como pecasexpress.logix.com.br)
  // Em logix-ochre.vercel.app não resolve nada e cai no padrão — comportamento correto
  const hostAtual = window.location.hostname;
  try {
    const resp = await fetch(`${BASE}/branding?host=${encodeURIComponent(hostAtual)}`);
    const temaHost = await resp.json();
    if (temaHost && temaHost.empresa_id) {
      // É um domínio white-label — aplica o tema do cliente já na tela de login
      aplicarTema(temaHost);
    } else {
      restaurarTemaPadrao();
    }
  } catch {
    restaurarTemaPadrao();
  }

  router.rota('/login',                () => import('./modulos/login.js'));
  router.rota('/',                     () => import('./modulos/dashboard.js'));
  router.rota('/acompanhamento',       () => import('./modulos/acompanhamento.js'));
  router.rota('/clientes',             () => import('./modulos/clientes.js'));
  router.rota('/clientes/:id/modulos', () => import('./modulos/cliente-modulos.js'));
  router.rota('/lojas',                () => import('./modulos/lojas.js'));
  router.rota('/entregas',             () => import('./modulos/entregas.js'));
  router.rota('/motoboys',             () => import('./modulos/motoboys.js'));
  router.rota('/rastreio',             () => import('./modulos/rastreio.js'));
  router.rota('/mapa',                 () => import('./modulos/mapa.js'));
  router.rota('/financeiro',           () => import('./modulos/financeiro.js'));
  router.rota('/marca',                () => import('./modulos/branding.js'));
  router.rota('/equipe',               () => import('./modulos/equipe.js'));
  router.rota('/configuracoes',        () => import('./modulos/configuracoes.js'));

  router.definirGuarda((caminho) => {
    if (caminho !== '/login' && !auth.estaLogado()) return '/login';
    if (caminho === '/login' && auth.estaLogado()) return '/';
    return null;
  });

  // Restaurar sessão e aplicar tema correto
  const logado = await auth.restaurar();
  if (logado) await aplicarTemaDoUsuario();

  router.iniciar();

  // Eventos de mudança de sessão
  document.addEventListener('logix:login',      () => aplicarTemaDoUsuario());
  document.addEventListener('logix:logout',     () => restaurarTemaPadrao());
  document.addEventListener('logix:impersonar', () => aplicarTemaDoUsuario());
  document.addEventListener('logix:voltar',     () => { restaurarTemaPadrao(); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();

// Bootstrap da aplicação: tema, sessão, rotas.
import * as api from './core/api.js';
import * as auth from './core/auth.js';
import * as router from './core/router.js';
import { carregarTema, aplicarTema } from './core/tema.js';

async function boot() {
  const app = document.getElementById('app');
  if (window.LOGIX_API) api.setBase(window.LOGIX_API);
  router.definirSaida(app);

  // Tema público (fallback pelo host — funciona em domínios white-label customizados)
  await carregarTema({ base: window.LOGIX_API || '/api/v1' });

  router.rota('/login',                () => import('./modulos/login.js'));
  router.rota('/',                     () => import('./modulos/dashboard.js'));
  router.rota('/clientes',             () => import('./modulos/clientes.js'));
  router.rota('/clientes/:id/modulos', () => import('./modulos/cliente-modulos.js'));
  router.rota('/entregas',             () => import('./modulos/entregas.js'));
  router.rota('/motoboys',             () => import('./modulos/motoboys.js'));
  router.rota('/filas',                () => import('./modulos/filas.js'));
  router.rota('/marca',                () => import('./modulos/branding.js'));
  router.rota('/equipe',               () => import('./modulos/equipe.js'));

  router.definirGuarda((caminho) => {
    if (caminho !== '/login' && !auth.estaLogado()) return '/login';
    if (caminho === '/login' && auth.estaLogado()) return '/';
    return null;
  });

  // Restaurar sessão e depois recarregar o tema com o token do usuário logado
  const logado = await auth.restaurar();
  if (logado) await recarregarTemaAutenticado();

  router.iniciar();

  // Ao fazer login, recarregar tema do tenant
  document.addEventListener('logix:login', async () => {
    await recarregarTemaAutenticado();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

async function recarregarTemaAutenticado() {
  try {
    const token = api.getToken();
    if (!token) return;
    // super_admin não tem branding próprio — usa o padrão
    const u = auth.usuarioAtual();
    if (u && u.perfil === 'super_admin' && !auth.estaImpersonando()) return;
    await carregarTema({ base: window.LOGIX_API || '/api/v1', token });
  } catch { /* silencioso */ }
}

boot();

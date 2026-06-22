// Bootstrap da aplicação: tema, sessão, rotas. Mantido intencionalmente pequeno.
import * as api from './core/api.js';
import * as auth from './core/auth.js';
import * as router from './core/router.js';
import { carregarTema } from './core/tema.js';

async function boot() {
  const app = document.getElementById('app');
  if (window.LOGIX_API) api.setBase(window.LOGIX_API);
  router.definirSaida(app);

  await carregarTema({ base: window.LOGIX_API || '/api/v1' });   // white-label por host (antes do login)

  // Cada módulo é carregado sob demanda (code-splitting nativo via import dinâmico).
  router.rota('/login', () => import('./modulos/login.js'));
  router.rota('/', () => import('./modulos/dashboard.js'));
  router.rota('/entregas', () => import('./modulos/entregas.js'));
  router.rota('/motoboys', () => import('./modulos/motoboys.js'));
  router.rota('/clientes', () => import('./modulos/clientes.js'));
  router.rota('/marca', () => import('./modulos/branding.js'));

  router.definirGuarda((caminho) => {
    if (caminho !== '/login' && !auth.estaLogado()) return '/login';
    if (caminho === '/login' && auth.estaLogado()) return '/';
    return null;
  });

  await auth.restaurar();
  router.iniciar();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();

/* Smoke-test da cadeia principal contra uma API rodando.
   Uso: BASE_URL=https://... ADMIN_EMAIL=... ADMIN_SENHA=... npm run smoke
   Usa coordenadas explícitas para não depender do geocoding do ORS. */
require('dotenv').config();

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.ADMIN_EMAIL;
const SENHA = process.env.ADMIN_SENHA;

let token = null;
let passou = 0, falhou = 0;

async function req(metodo, caminho, { corpo, empresaId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (empresaId) headers['X-Empresa-Id'] = empresaId;
  const resp = await fetch(BASE + caminho, {
    method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let dados; try { dados = await resp.json(); } catch { dados = null; }
  return { status: resp.status, dados };
}

function checa(nome, ok, extra = '') {
  if (ok) { passou++; console.log('  OK   ' + nome + (extra ? '  ' + extra : '')); }
  else { falhou++; console.log('  FALHA ' + nome + (extra ? '  ' + extra : '')); }
}

async function rodar() {
  if (!EMAIL || !SENHA) { console.error('Defina ADMIN_EMAIL e ADMIN_SENHA.'); process.exit(1); }
  console.log('Smoke-test em', BASE, '\n');

  // 1) health
  const h = await fetch(BASE.replace('/api/v1', '') + '/health').then((r) => r.json()).catch(() => null);
  checa('GET /health', h && h.ok === true);

  // 2) login
  const login = await req('POST', '/auth/login', { corpo: { email: EMAIL, senha: SENHA } });
  token = login.dados && login.dados.accessToken;
  checa('POST /auth/login', login.status === 200 && !!token);
  if (!token) { resumo(); return; }

  // 3) cria empresa (tenant) + usuário responsável
  const cnpj = String(Date.now()).padStart(14, '0').slice(-14);
  const empresa = await req('POST', '/empresas', { corpo: {
    razao_social: 'Cliente Smoke ' + cnpj.slice(-4), cnpj,
    email: 'smoke+' + cnpj + '@logix.com.br', senha: 'Smoke@123', responsavel: 'Fulano',
  }});
  const empresaId = empresa.dados && empresa.dados.empresa && empresa.dados.empresa.id;
  checa('POST /empresas', empresa.status === 201 && !!empresaId);

  // 4) lista empresas
  const lista = await req('GET', '/empresas');
  checa('GET /empresas', lista.status === 200 && Array.isArray(lista.dados));

  // 5) cria motoboy (super admin escopa via X-Empresa-Id)
  const motoboy = await req('POST', '/motoboys', { empresaId, corpo: {
    nome_completo: 'Motoboy Smoke', cpf: '12345678901',
  }});
  checa('POST /motoboys', motoboy.status === 201, 'status=' + motoboy.status);

  // 6) lança entrega (coords explícitas -> não depende do ORS p/ geocoding)
  const entrega = await req('POST', '/entregas', { empresaId, corpo: {
    coleta: { nome: 'Matriz', endereco: 'Av. Tancredo Neves, Salvador', lat: -12.978, lng: -38.458 },
    destinos: [{ nome: 'Cliente A', endereco: 'Pituba, Salvador', lat: -13.003, lng: -38.458 }],
  }});
  const entregaId = entrega.dados && entrega.dados.id;
  checa('POST /entregas', entrega.status === 201 && !!entregaId, entregaId ? entrega.dados.protocolo : '');

  // 7) acompanha
  if (entregaId) {
    const acomp = await req('GET', '/entregas/' + entregaId + '/acompanhar', { empresaId });
    checa('GET /entregas/:id/acompanhar', acomp.status === 200 && acomp.dados && acomp.dados.id === entregaId);
  }

  // 8) permissões: catálogo de módulos + acesso efetivo do usuário logado
  const mods = await req('GET', '/permissoes/modulos');
  checa('GET /permissoes/modulos', mods.status === 200 && Array.isArray(mods.dados) && mods.dados.length > 0);

  const eu = await req('GET', '/permissoes/eu');
  checa('GET /permissoes/eu', eu.status === 200 && eu.dados && eu.dados.perfil === 'super_admin');

  // 9) empresa recém-criada deve nascer com os módulos padrão habilitados
  if (empresaId) {
    const me = await req('GET', '/permissoes/empresas/' + empresaId + '/modulos');
    const ativos = (me.dados || []).filter((m) => m.ativo).map((m) => m.codigo);
    checa('módulos padrão na empresa nova', me.status === 200 && ativos.includes('entregas') && ativos.includes('motoboys'));
  }

  resumo();
}

function resumo() {
  console.log('\nResultado: ' + passou + ' OK, ' + falhou + ' falha(s).');
  process.exit(falhou ? 1 : 0);
}

rodar().catch((e) => { console.error('Erro no smoke-test:', e.message); process.exit(1); });

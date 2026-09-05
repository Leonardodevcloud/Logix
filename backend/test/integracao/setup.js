// Helpers dos testes de integração. Exigem DATABASE_URL_TEST (Postgres real).
// Sem a variável, os testes de integração são PULADOS (unitários continuam rodando).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const TEM_BANCO = !!process.env.DATABASE_URL_TEST;

export function prepararAmbiente() {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.DB_SSL = 'false';
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'segredo-teste-integracao';
  process.env.ORS_API_KEY = process.env.ORS_API_KEY || 'x';
  process.env.CORS_ORIGIN = 'http://painel.teste';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.WORKER_EMBUTIDO = 'false';
}

export async function subirApp() {
  prepararAmbiente();
  const { montarApp, migrar } = require('../../src/app');
  await migrar();
  return montarApp();
}

export function db() { return require('../../src/shared/db'); }

// Cria super admin + empresa (com central_admin) e devolve tokens prontos.
export async function criarCenario(app, request, sufixo) {
  const { query } = db();
  const sh = require('../../src/modules/auth/auth.shared');
  const emailAdmin = `super-${sufixo}@teste.local`;
  const hash = await sh.hashSenha('Senha123!');
  await query(`INSERT INTO usuarios (perfil, nome, email, senha_hash) VALUES ('super_admin', 'Super', $1, $2) ON CONFLICT (email) DO UPDATE SET senha_hash = $2`, [emailAdmin, hash]);
  const login = await request(app).post('/api/v1/auth/login').send({ email: emailAdmin, senha: 'Senha123!' });
  const tokenSuper = login.body.accessToken;

  const cnpj = String(Date.now() + Math.floor(Math.random() * 1000)).padStart(14, '0').slice(-14);
  const emp = await request(app).post('/api/v1/empresas').set('Authorization', `Bearer ${tokenSuper}`).send({
    razao_social: `Empresa ${sufixo} LTDA`, nome_fantasia: `Empresa ${sufixo}`, cnpj,
    email: `dono-${sufixo}@teste.local`, senha: 'Senha123!', responsavel: 'Dono',
  });
  if (emp.status >= 300) throw new Error('criar empresa falhou: ' + JSON.stringify(emp.body));
  const empresaId = emp.body.empresa.id;
  const loginDono = await request(app).post('/api/v1/auth/login').send({ email: `dono-${sufixo}@teste.local`, senha: 'Senha123!' });
  return { tokenSuper, empresaId, tokenDono: loginDono.body.accessToken, corpoEmpresa: emp.body };
}

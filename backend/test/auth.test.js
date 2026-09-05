import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

beforeAll(() => { process.env.JWT_ACCESS_SECRET = 'segredo-teste'; });
const { verificarToken, verificarTokenMotoboy } = require('../src/middleware/auth');
const rodar = (mw, req) => new Promise((ok) => mw(req, {}, (err) => ok({ err, req })));

describe('verificarToken', () => {
  it('NÃO aceita mais o cookie lx_access (ADR-003) — só Bearer', async () => {
    const t = jwt.sign({ id: 'u1', perfil: 'loja' }, 'segredo-teste');
    const { err } = await rodar(verificarToken, { headers: {}, cookies: { lx_access: t } });
    expect(err.status).toBe(401);
  });
  it('aceita Bearer válido', async () => {
    const t = jwt.sign({ id: 'u1', perfil: 'loja' }, 'segredo-teste');
    const { err, req } = await rodar(verificarToken, { headers: { authorization: 'Bearer ' + t }, cookies: {} });
    expect(err).toBeUndefined(); expect(req.usuario.id).toBe('u1');
  });
  it('rejeita token assinado com outro segredo', async () => {
    const t = jwt.sign({ id: 'u1' }, 'outro');
    const { err } = await rodar(verificarToken, { headers: { authorization: 'Bearer ' + t }, cookies: {} });
    expect(err.status).toBe(401);
  });
});

describe('verificarTokenMotoboy', () => {
  it('token de usuário do painel não serve no app', async () => {
    const t = jwt.sign({ id: 'u1', perfil: 'central_admin' }, 'segredo-teste');
    const { err } = await rodar(verificarTokenMotoboy, { headers: { authorization: 'Bearer ' + t } });
    expect(err.status).toBe(401);
  });
});

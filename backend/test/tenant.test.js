// Isolamento de tenant: o middleware nunca pode deixar um perfil escapar do próprio escopo.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { resolverTenant, exigirCentral } = require('../src/middleware/tenant');
const { PERFIS } = require('../src/shared/constants');

function rodar(mw, req) {
  return new Promise((ok) => mw(req, {}, (err) => ok({ err, req })));
}
const base = (u, headers = {}) => ({ usuario: u, headers, query: {} });

describe('resolverTenant', () => {
  it('loja fica presa na própria empresa e loja mesmo enviando headers de outra', async () => {
    const { req } = await rodar(resolverTenant, base(
      { perfil: PERFIS.LOJA, empresaId: 'emp-A', lojaId: 'loja-1' },
      { 'x-empresa-id': 'emp-B', 'x-loja-id': 'loja-9' },
    ));
    expect(req.empresaId).toBe('emp-A');
    expect(req.lojaId).toBe('loja-1');
  });
  it('central_admin não troca de empresa via header', async () => {
    const { req } = await rodar(resolverTenant, base({ perfil: PERFIS.CENTRAL_ADMIN, empresaId: 'emp-A' }, { 'x-empresa-id': 'emp-B' }));
    expect(req.empresaId).toBe('emp-A');
  });
  it('super_admin escolhe a empresa pelo header', async () => {
    const { req } = await rodar(resolverTenant, base({ perfil: PERFIS.SUPER_ADMIN }, { 'x-empresa-id': 'emp-B' }));
    expect(req.empresaId).toBe('emp-B');
  });
  it('sem usuário → 401', async () => {
    const { err } = await rodar(resolverTenant, { headers: {}, query: {} });
    expect(err.status).toBe(401);
  });
});

describe('exigirCentral', () => {
  it('loja é barrada com 403', async () => {
    const { err } = await rodar(exigirCentral, base({ perfil: PERFIS.LOJA }));
    expect(err.status).toBe(403);
  });
  it('central_admin passa', async () => {
    const { err } = await rodar(exigirCentral, base({ perfil: PERFIS.CENTRAL_ADMIN }));
    expect(err).toBeUndefined();
  });
});

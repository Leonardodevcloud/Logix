// Row-Level Security como segunda trava: mesmo uma query SEM WHERE empresa_id, rodando
// no contexto da empresa B, não enxerga nem consegue gravar dados da empresa A.
// Exige RLS_ENABLED=true (o teste é pulado sem isso).
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { TEM_BANCO, subirApp, criarCenario } from './setup.js';
const require = createRequire(import.meta.url);

const RLS = process.env.RLS_ENABLED === 'true';

describe.skipIf(!TEM_BANCO || !RLS)('RLS (banco real, RLS_ENABLED=true)', () => {
  let app, A, B, entregaA, query, contexto;
  beforeAll(async () => {
    app = await subirApp();
    ({ query } = require('../../src/shared/db'));
    contexto = require('../../src/shared/contexto');
    const suf = 'rls' + Date.now().toString(36);
    A = await criarCenario(app, request, 'a' + suf);
    B = await criarCenario(app, request, 'b' + suf);
    const r = await request(app).post('/api/v1/entregas').set('Authorization', `Bearer ${A.tokenDono}`).send({
      coleta: { nome: 'A', endereco: 'Av. Tancredo Neves, Salvador', lat: -12.978, lng: -38.458 },
      destinos: [{ nome: 'C', endereco: 'Pituba, Salvador', lat: -13.003, lng: -38.458 }],
    });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    entregaA = r.body.id;
  }, 60000);

  const noContexto = (empresaId, fn) => contexto.comContexto({ rlsEmpresaId: empresaId }, fn);

  it('sem contexto (cron/migrations) vê tudo', async () => {
    const { rows } = await query(`SELECT id FROM entregas WHERE id = $1`, [entregaA]);
    expect(rows.length).toBe(1);
  });
  it('no contexto de B, um SELECT sem filtro de empresa NÃO devolve a entrega de A', async () => {
    const { rows } = await noContexto(B.empresaId, () => query(`SELECT id FROM entregas WHERE id = $1`, [entregaA]));
    expect(rows.length).toBe(0);
  });
  it('no contexto de A, a mesma query devolve', async () => {
    const { rows } = await noContexto(A.empresaId, () => query(`SELECT id FROM entregas WHERE id = $1`, [entregaA]));
    expect(rows.length).toBe(1);
  });
  it('no contexto de B, gravar uma linha da empresa A é barrado pelo banco (WITH CHECK)', async () => {
    await expect(noContexto(B.empresaId, () => query(
      `INSERT INTO lojas (empresa_id, nome_fantasia) VALUES ($1, 'invasora')`, [A.empresaId]
    ))).rejects.toMatchObject({ code: '42501' }); // insufficient_privilege (row-level security policy)
  });
  it('fluxo HTTP completo continua funcionando com RLS ligado (B lista, A lista, super lista)', async () => {
    const rb = await request(app).get('/api/v1/entregas').set('Authorization', `Bearer ${B.tokenDono}`);
    const ra = await request(app).get('/api/v1/entregas').set('Authorization', `Bearer ${A.tokenDono}`);
    const rs = await request(app).get('/api/v1/entregas').set('Authorization', `Bearer ${A.tokenSuper}`).set('X-Empresa-Id', A.empresaId);
    expect(rb.status).toBe(200); expect(ra.status).toBe(200); expect(rs.status).toBe(200);
    const ids = (arr) => (Array.isArray(arr) ? arr : (arr.itens || arr.entregas || [])).map((e) => e.id);
    expect(ids(ra.body)).toContain(entregaA);
    expect(ids(rb.body)).not.toContain(entregaA);
    expect(ids(rs.body)).toContain(entregaA);
  });
});

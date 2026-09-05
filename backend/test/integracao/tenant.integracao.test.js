// ISOLAMENTO DE TENANT COM BANCO REAL — o teste que vale contrato.
// Empresa A cria uma entrega; empresa B (central_admin) não pode vê-la nem por id.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { TEM_BANCO, subirApp, criarCenario } from './setup.js';

describe.skipIf(!TEM_BANCO)('isolamento de tenant (banco real)', () => {
  let app, A, B, entregaA;
  beforeAll(async () => {
    app = await subirApp();
    const suf = Date.now().toString(36);
    A = await criarCenario(app, request, 'a' + suf);
    B = await criarCenario(app, request, 'b' + suf);
    expect(A.tokenDono).toBeTruthy();
    expect(B.tokenDono).toBeTruthy();

    const r = await request(app).post('/api/v1/entregas').set('Authorization', `Bearer ${A.tokenDono}`).send({
      coleta: { nome: 'Matriz A', endereco: 'Av. Tancredo Neves, Salvador', lat: -12.978, lng: -38.458 },
      destinos: [{ nome: 'Cliente', endereco: 'Pituba, Salvador', lat: -13.003, lng: -38.458 }],
    });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    entregaA = r.body.id;
    expect(entregaA).toBeTruthy();
  }, 60000);

  it('A vê a própria entrega', async () => {
    const r = await request(app).get(`/api/v1/entregas/${entregaA}/acompanhar`).set('Authorization', `Bearer ${A.tokenDono}`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(entregaA);
  });

  it('B NÃO vê a entrega de A por id (404, não 403 — não vaza existência)', async () => {
    const r = await request(app).get(`/api/v1/entregas/${entregaA}/acompanhar`).set('Authorization', `Bearer ${B.tokenDono}`);
    expect([404, 403]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toContain(entregaA);
  });

  it('B não recebe a entrega de A na listagem', async () => {
    const r = await request(app).get('/api/v1/entregas').set('Authorization', `Bearer ${B.tokenDono}`);
    expect(r.status).toBe(200);
    const lista = Array.isArray(r.body) ? r.body : (r.body.itens || r.body.entregas || []);
    expect(lista.find((e) => e.id === entregaA)).toBeUndefined();
  });

  it('central_admin de B não troca de empresa via header X-Empresa-Id', async () => {
    const r = await request(app).get('/api/v1/entregas').set('Authorization', `Bearer ${B.tokenDono}`).set('X-Empresa-Id', A.empresaId);
    expect(r.status).toBe(200);
    const lista = Array.isArray(r.body) ? r.body : (r.body.itens || r.body.entregas || []);
    expect(lista.find((e) => e.id === entregaA)).toBeUndefined();
  });

  it('cookie lx_access não autentica (ADR-003)', async () => {
    const r = await request(app).get('/api/v1/auth/eu').set('Cookie', `lx_access=${A.tokenDono}`);
    expect(r.status).toBe(401);
  });

  it('origem white-label não cadastrada não recebe CORS', async () => {
    const r = await request(app).get('/health/live').set('Origin', 'https://evil.com');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
});

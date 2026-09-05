import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { schemas } = require('../src/shared/schemas');

describe('schema posicao (GPS)', () => {
  it('aceita e coage números em string', () => {
    const r = schemas.posicao.safeParse({ lat: '-12.97', lng: '-38.51' });
    expect(r.success).toBe(true);
    expect(r.data.lat).toBeCloseTo(-12.97);
  });
  it('rejeita latitude fora da faixa', () => {
    expect(schemas.posicao.safeParse({ lat: 95, lng: 0 }).success).toBe(false);
  });
  it('aceita lat/lng zero (o antigo `!lat` rejeitava 0)', () => {
    expect(schemas.posicao.safeParse({ lat: 0, lng: 0 }).success).toBe(true);
  });
  it('rejeita entrega_id que não é uuid', () => {
    expect(schemas.posicao.safeParse({ lat: 1, lng: 1, entrega_id: '123' }).success).toBe(false);
  });
});

describe('schema login', () => {
  it('normaliza e-mail', () => {
    const r = schemas.login.safeParse({ email: '  Fulano@Ex.com ', senha: 'x' });
    expect(r.success).toBe(true);
    expect(r.data.email).toBe('fulano@ex.com');
  });
  it('rejeita e-mail inválido', () => {
    expect(schemas.login.safeParse({ email: 'nope', senha: 'x' }).success).toBe(false);
  });
});

describe('schema pushRegistrar', () => {
  it('só aceita token no formato Expo', () => {
    expect(schemas.pushRegistrar.safeParse({ token: 'ExponentPushToken[abc]' }).success).toBe(true);
    expect(schemas.pushRegistrar.safeParse({ token: 'abc' }).success).toBe(false);
  });
});

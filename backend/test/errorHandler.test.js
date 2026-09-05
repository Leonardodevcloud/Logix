import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const errorHandler = require('../src/middleware/errorHandler');
const AppError = require('../src/shared/AppError');

function res() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = { id: 'req-1', originalUrl: '/x', method: 'GET' };

describe('errorHandler', () => {
  it('AppError mantém status e devolve reqId', () => {
    const r = res(); errorHandler(AppError.proibido('não'), req, r, () => {});
    expect(r.code).toBe(403); expect(r.body.reqId).toBe('req-1');
  });
  it('unique_violation do PG vira 409 (não 500)', () => {
    const r = res(); errorHandler(Object.assign(new Error('dup'), { code: '23505' }), req, r, () => {});
    expect(r.code).toBe(409);
  });
  it('uuid inválido (22P02) vira 422', () => {
    const r = res(); errorHandler(Object.assign(new Error('bad'), { code: '22P02' }), req, r, () => {});
    expect(r.code).toBe(422);
  });
  it('erro desconhecido vira 500 SEM vazar a mensagem interna', () => {
    const r = res(); errorHandler(new Error('senha do banco é 123'), req, r, () => {});
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('123');
    expect(r.body.reqId).toBe('req-1');
  });
  it('JSON malformado vira 400/422', () => {
    const r = res(); errorHandler(Object.assign(new Error('parse'), { type: 'entity.parse.failed' }), req, r, () => {});
    expect(r.code).toBe(422);
  });
});

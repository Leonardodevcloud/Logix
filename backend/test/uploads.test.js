import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const storage = require('../src/shared/storage');

const EMP = '11111111-1111-1111-1111-111111111111';

describe('storage: chaves de upload', () => {
  it('gera chave sob o prefixo da empresa e finalidade', () => {
    const k = storage.gerarChaveUpload({ empresaId: EMP, finalidade: 'protocolo', mime: 'image/jpeg' });
    expect(k.startsWith(`empresas/${EMP}/protocolo/`)).toBe(true);
    expect(k.endsWith('.jpg')).toBe(true);
  });
  it('chavePertenceA barra outra empresa, path traversal e finalidade errada', () => {
    const k = storage.gerarChaveUpload({ empresaId: EMP, finalidade: 'protocolo', mime: 'image/png' });
    expect(storage.chavePertenceA(k, EMP)).toBe(true);
    expect(storage.chavePertenceA(k, EMP, 'protocolo')).toBe(true);
    expect(storage.chavePertenceA(k, EMP, 'documento')).toBe(false);
    expect(storage.chavePertenceA(k, '22222222-2222-2222-2222-222222222222')).toBe(false);
    expect(storage.chavePertenceA(`empresas/${EMP}/../outra/x.jpg`, EMP)).toBe(false);
    expect(storage.chavePertenceA('/etc/passwd', EMP)).toBe(false);
  });
  it('ehChaveStorage distingue chave de data URI e URL', () => {
    expect(storage.ehChaveStorage(`empresas/${EMP}/chat/202609/a.jpg`)).toBe(true);
    expect(storage.ehChaveStorage('data:image/jpeg;base64,/9j/')).toBe(false);
    expect(storage.ehChaveStorage('https://x/y.jpg')).toBe(false);
  });
});

describe('uploads.service: regras', () => {
  const svc = require('../src/modules/uploads/uploads.service');
  it('rejeita finalidade e mime inválidos antes de tocar no storage', async () => {
    process.env.STORAGE_ENDPOINT = 'x'; process.env.STORAGE_BUCKET = 'b'; process.env.STORAGE_ACCESS_KEY = 'k'; process.env.STORAGE_SECRET_KEY = 's';
    await expect(svc.criarUrlUpload({ empresaId: EMP, finalidade: 'virus', mime: 'image/jpeg' })).rejects.toMatchObject({ status: 422 });
    await expect(svc.criarUrlUpload({ empresaId: EMP, finalidade: 'protocolo', mime: 'application/x-msdownload' })).rejects.toMatchObject({ status: 422 });
    await expect(svc.criarUrlUpload({ empresaId: EMP, finalidade: 'logo', mime: 'image/png', tamanho: 50 * 1024 * 1024 })).rejects.toMatchObject({ status: 422 });
  });
  it('confirmarChave rejeita chave de outra empresa sem consultar o storage', async () => {
    await expect(svc.confirmarChave({ empresaId: EMP, key: 'empresas/22222222-2222-2222-2222-222222222222/protocolo/x.jpg', finalidade: 'protocolo' })).rejects.toMatchObject({ status: 422 });
  });
  it('urlParaExibir deixa URL/data URI legada intacta', async () => {
    expect(await svc.urlParaExibir('https://a/b.jpg')).toBe('https://a/b.jpg');
    expect(await svc.urlParaExibir(null)).toBe(null);
  });
});

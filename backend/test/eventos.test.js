import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const eventos = require('../src/shared/eventos');

const tick = () => new Promise((r) => setImmediate(r));

describe('barramento de eventos', () => {
  beforeEach(() => eventos.limpar());
  it('entrega o payload ao ouvinte', async () => {
    let recebido = null;
    eventos.ouvir('entrega.concluida', (d) => { recebido = d; });
    eventos.emitir('entrega.concluida', { entregaId: 'e1' });
    await tick();
    expect(recebido).toEqual({ entregaId: 'e1' });
  });
  it('um ouvinte que lança não afeta os outros nem o emissor', async () => {
    let ok = false;
    eventos.ouvir('oferta.aceita', () => { throw new Error('boom'); });
    eventos.ouvir('oferta.aceita', () => { ok = true; });
    expect(() => eventos.emitir('oferta.aceita', {})).not.toThrow();
    await tick(); await tick();
    expect(ok).toBe(true);
  });
  it('rejeita nome fora do padrão agregado.fato', () => {
    expect(() => eventos.emitir('EntregaConcluida', {})).toThrow();
  });
});

// Concorrência: promoverOndasPendentes rodando em paralelo (simula 2 réplicas)
// nunca promove a mesma onda duas vezes; locks de cron não executam em duplicidade.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { TEM_BANCO, prepararAmbiente } from './setup.js';
const require = createRequire(import.meta.url);

describe.skipIf(!TEM_BANCO)('concorrência entre processos (banco real)', () => {
  let query, filas, locks;
  beforeAll(async () => {
    prepararAmbiente();
    const { migrar } = require('../../src/app');
    await migrar();
    ({ query } = require('../../src/shared/db'));
    filas = require('../../src/modules/filas/filas.service');
    locks = require('../../src/shared/locks');
  }, 60000);

  it('comLockExclusivo: chamadas simultâneas com a mesma chave executam UMA', async () => {
    let execucoes = 0;
    const trabalho = async () => { execucoes++; await new Promise((r) => setTimeout(r, 300)); };
    const rs = await Promise.all([1, 2, 3].map(() => locks.comLockExclusivo('teste:lock', trabalho)));
    expect(execucoes).toBe(1);
    expect(rs.filter((r) => r.executou).length).toBe(1);
  });

  it('promoverOndasPendentes em paralelo não duplica candidatos', async () => {
    const emp = await query(`INSERT INTO empresas (nome_fantasia, razao_social, cnpj) VALUES ('Conc', 'Conc LTDA', $1) RETURNING id`, [String(Date.now()).padStart(14, '0')]);
    const empresaId = emp.rows[0].id;
    const m1 = await query(`INSERT INTO motoboys (empresa_id, nome_completo, cpf, telefone_principal, status) VALUES ($1, 'M1', $2, '7199', 'ativo') RETURNING id`, [empresaId, String(Date.now()).slice(-11)]);
    const ent = await query(`INSERT INTO entregas (empresa_id, protocolo, status) VALUES ($1, $2, 'aguardando_atribuicao') RETURNING id`, [empresaId, 'T' + Date.now()]);
    const ofe = await query(
      `INSERT INTO entregas_ofertas (empresa_id, entrega_id, status, ondas, onda_atual, onda_intervalo_seg, proxima_onda_em, expira_em)
       VALUES ($1, $2, 'ofertada', $3::jsonb, 0, 15, now() - interval '1 second', now() + interval '10 minutes') RETURNING id`,
      [empresaId, ent.rows[0].id, JSON.stringify([[], [{ m: m1.rows[0].id, d: 1.2 }]])]
    );
    await Promise.all([filas.promoverOndasPendentes(), filas.promoverOndasPendentes(), filas.promoverOndasPendentes()]);
    const cand = await query(`SELECT count(*)::int AS n FROM entregas_ofertas_candidatos WHERE oferta_id = $1`, [ofe.rows[0].id]);
    const est = await query(`SELECT onda_atual FROM entregas_ofertas WHERE id = $1`, [ofe.rows[0].id]);
    expect(cand.rows[0].n).toBe(1);
    expect(Number(est.rows[0].onda_atual)).toBe(1);
  });
});

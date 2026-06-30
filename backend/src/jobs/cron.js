const cron = require('node-cron');
const { query } = require('../shared/db');

// Retenção curta de rastreamento = menos volume de banco = menos custo.
// Dica de escala: com 300 motoboys sao ~1,2M linhas/dia. Se nao precisar de
// historico GPS longo (disputas/auditoria), defina RASTREAMENTO_RETENCAO_DIAS=7.
const RETENCAO_DIAS = Number(process.env.RASTREAMENTO_RETENCAO_DIAS) || 30;
// Tamanho do lote da limpeza: apaga em pedacos para nao travar a tabela.
const LOTE_LIMPEZA = Number(process.env.RASTREAMENTO_LOTE) || 50000;

// Agenda os jobs de manutenção. `origem` só identifica nos logs (api | worker).
function iniciarCron(origem = 'worker') {
  // Limpeza diária às 03:00: rastreamento antigo + refresh tokens vencidos/revogados.
  cron.schedule('0 3 * * *', async () => {
    try {
      // Apaga o rastreamento expirado em LOTES. Um DELETE unico de >1M linhas
      // trava a tabela e gera bloat pesado (o autovacuum nao acompanha). Em lotes,
      // a tabela respira entre cada pedaco e o impacto fica diluido.
      let totalRast = 0;
      for (let i = 0; i < 400; i++) {
        const r = await query(
          `DELETE FROM rastreamento
            WHERE ctid IN (
              SELECT ctid FROM rastreamento
               WHERE capturado_em < now() - make_interval(days => $1)
               LIMIT $2
            )`,
          [RETENCAO_DIAS, LOTE_LIMPEZA]
        );
        totalRast += r.rowCount;
        if (r.rowCount < LOTE_LIMPEZA) break;       // acabou o periodo expirado
        await new Promise(res => setTimeout(res, 250)); // respiro entre lotes
      }
      const r2 = await query(`DELETE FROM refresh_tokens WHERE expira_em < now() OR revogado = TRUE`);
      console.log(`[cron:${origem}] rastreamento expirado=${totalRast}, refresh limpos=${r2.rowCount}`);
    } catch (e) {
      console.error(`[cron:${origem}] erro na limpeza diária:`, e.message);
    }
  });
  // Keep-warm: a cada 2 min um SELECT trivial mantém o banco (Neon) acordado.
  // O Neon suspende a computação após ~5 min ociosos; 2 min dá margem segura.
  cron.schedule('*/2 * * * *', async () => {
    try { await query('SELECT 1'); }
    catch (e) { console.error(`[cron:${origem}] keep-warm falhou:`, e.message); }
  });

  // TODO: reentrega de webhooks com falha (quando o módulo de integrações entrar).
  console.log(`[cron:${origem}] agendado (retenção rastreamento=${RETENCAO_DIAS}d)`);
}

module.exports = { iniciarCron };

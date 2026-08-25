const cron = require('node-cron');
const { query } = require('../shared/db');
const radar = require('../modules/radar');
const { emitirParaEmpresa } = require('../realtime/ws');

// Retenção curta de rastreamento = menos volume de banco = menos custo.
const RETENCAO_DIAS = Number(process.env.RASTREAMENTO_RETENCAO_DIAS) || 30;

// Agenda os jobs de manutenção. `origem` só identifica nos logs (api | worker).
function iniciarCron(origem = 'worker') {
  // Limpeza diária às 03:00: rastreamento antigo + refresh tokens vencidos/revogados.
  cron.schedule('0 3 * * *', async () => {
    try {
      const r1 = await query(
        `DELETE FROM rastreamento WHERE capturado_em < now() - make_interval(days => $1)`,
        [RETENCAO_DIAS]
      );
      const r2 = await query(`DELETE FROM refresh_tokens WHERE expira_em < now() OR revogado = TRUE`);
      console.log(`[cron:${origem}] rastreamento expirado=${r1.rowCount}, refresh limpos=${r2.rowCount}`);
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

  // Radar operacional: a cada 1 min, detecta motoboys parados / sem sinal em corridas
  // em rota. Só roda para empresas com config ativa (o service filtra isso).
  cron.schedule('*/1 * * * *', async () => {
    try { await radar.varrerAlertas(emitirParaEmpresa); }
    catch (e) { console.error(`[cron:${origem}] radar falhou:`, e.message); }
  });

  // Webhooks de integração: reconciliação de estado a cada 20s. Compara as colunas
  // da entrega com o que já foi notificado e dispara os momentos que faltaram
  // (0/0.5/0.75/1/2/3) para o sistema do cliente — sem tocar no motor de entrega.
  const integracoes = require('../modules/integracoes');
  let _reconciliando = false;
  cron.schedule('*/20 * * * * *', async () => {
    if (_reconciliando) return; // evita sobreposição se um ciclo demorar
    _reconciliando = true;
    try { await integracoes.reconciliarWebhooks(); }
    catch (e) { console.error(`[cron:${origem}] webhook integração falhou:`, e.message); }
    finally { _reconciliando = false; }
  });

  // Fechamento automático do financeiro: a cada 10 min verifica empresas cujo
  // horário semanal chegou e fecha o período (o service filtra o que é devido).
  const financeiro = require('../modules/financeiro');
  let _fechando = false;
  cron.schedule('*/10 * * * *', async () => {
    if (_fechando) return;
    _fechando = true;
    try { await financeiro.service.rodarFechamentosAutomaticos(); }
    catch (e) { console.error(`[cron:${origem}] fechamento automático falhou:`, e.message); }
    finally { _fechando = false; }
  });

  console.log(`[cron:${origem}] agendado (retenção rastreamento=${RETENCAO_DIAS}d, webhooks integração=20s)`);
}

module.exports = { iniciarCron };

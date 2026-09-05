const cron = require('node-cron');
const log = require('../shared/logger');
const { comLockExclusivo } = require('../shared/locks');
const posicoes = require('../modules/posicoes');
const { query } = require('../shared/db');
const radar = require('../modules/radar');
const { emitirParaEmpresa } = require('../realtime/ws');

// Retenção curta de rastreamento = menos volume de banco = menos custo.
const RETENCAO_DIAS = Number(process.env.RASTREAMENTO_RETENCAO_DIAS) || 30;

// Agenda os jobs de manutenção. `origem` só identifica nos logs (api | worker).
function iniciarCron(origem = 'worker') {
  // Limpeza diária às 03:00: rastreamento antigo + refresh tokens vencidos/revogados.
  // Todo job roda dentro de um advisory lock do Postgres: se a API tiver N réplicas
  // com cron embutido, ou API + worker ao mesmo tempo, só UM processo executa.
  cron.schedule('0 3 * * *', () => comLockExclusivo('cron:limpeza', async () => {
    try {
      // Histórico GPS: partições diárias — cria as próximas e DROPA as vencidas (instantâneo).
      // Se por algum motivo a tabela ainda não for particionada, cai no DELETE antigo.
      const part = await posicoes.manterParticoes({ diasFrente: 7, retencaoDias: RETENCAO_DIAS });
      let removidos = null;
      if (!part.particionada) {
        const r1 = await query(`DELETE FROM rastreamento WHERE capturado_em < now() - make_interval(days => $1)`, [RETENCAO_DIAS]);
        removidos = r1.rowCount;
      }
      const r2 = await query(`DELETE FROM refresh_tokens WHERE expira_em < now() OR revogado = TRUE`);
      log.info({ origem, particoes: part, rastreamento_removidos: removidos, refresh_removidos: r2.rowCount }, 'cron limpeza diária');
    } catch (e) {
      log.error({ origem, err: e }, 'cron: erro na limpeza diária');
    }
  }).catch((e) => log.error({ err: e }, 'cron limpeza: lock falhou')));
  // Keep-warm: a cada 2 min um SELECT trivial mantém o banco (Neon) acordado.
  // O Neon suspende a computação após ~5 min ociosos; 2 min dá margem segura.
  cron.schedule('*/2 * * * *', async () => {
    try { await query('SELECT 1'); }
    catch (e) { log.error({ origem, err: e }, 'cron: keep-warm falhou'); }
  });

  // Radar operacional: a cada 1 min, detecta motoboys parados / sem sinal em corridas
  // em rota. Só roda para empresas com config ativa (o service filtra isso).
  cron.schedule('*/1 * * * *', () => comLockExclusivo('cron:radar', async () => {
    try { await radar.varrerAlertas(emitirParaEmpresa); }
    catch (e) { log.error({ origem, err: e }, 'cron: radar falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron radar: lock falhou')));

  // Webhooks de integração: reconciliação de estado a cada 20s. Compara as colunas
  // da entrega com o que já foi notificado e dispara os momentos que faltaram
  // (0/0.5/0.75/1/2/3) para o sistema do cliente — sem tocar no motor de entrega.
  const integracoes = require('../modules/integracoes');
  // O lock do Postgres substitui a flag em memória: vale entre processos.
  cron.schedule('*/20 * * * * *', () => comLockExclusivo('cron:webhooks', async () => {
    try { await integracoes.reconciliarWebhooks(); }
    catch (e) { log.error({ origem, err: e }, 'cron: webhook integração falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron webhooks: lock falhou')));

  // Fechamento automático do financeiro: a cada 10 min verifica empresas cujo
  // horário semanal chegou e fecha o período (o service filtra o que é devido).
  const financeiro = require('../modules/financeiro');
  cron.schedule('*/10 * * * *', () => comLockExclusivo('cron:fechamento', async () => {
    try { await financeiro.service.rodarFechamentosAutomaticos(); }
    catch (e) { log.error({ origem, err: e }, 'cron: fechamento automático falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron fechamento: lock falhou')));

  log.info({ origem, retencao_dias: RETENCAO_DIAS }, 'cron agendado');
}

module.exports = { iniciarCron };

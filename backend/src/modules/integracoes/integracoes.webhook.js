const crypto = require('crypto');
const { query } = require('../../shared/db');
const M = require('./integracoes.mapeador');

// Notificação de status para o sistema do cliente (webhook), por RECONCILIAÇÃO.
// O worker compara colunas da entrega com o que já foi enviado e dispara o que
// faltou. Assim NÃO tocamos no fluxo de aceitar/coletar/finalizar (o motor de
// entrega fica intacto). Momentos, no mesmo padrão do contrato externo:
//   0    recebeu a O.S. (motoboy atribuído)
//   0.5  chegou na coleta
//   0.75 confirmou a coleta (saiu em rota)
//   1    finalizou um ponto (um por ponto)
//   2    finalizou a O.S.
//   3    cancelada

function assinar(corpo, segredo) {
  return 'sha256=' + crypto.createHmac('sha256', segredo || '').update(corpo).digest('hex');
}

// POST com timeout curto. Sem reenvio (igual ao contrato externo): registra e segue.
async function enviar(url, payload, segredo) {
  const corpo = JSON.stringify(payload);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lx-signature': assinar(corpo, segredo) },
      body: corpo,
      signal: ctrl.signal,
    });
    return { statusHttp: resp.status, erro: resp.ok ? null : `HTTP ${resp.status}` };
  } catch (e) {
    return { statusHttp: null, erro: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function fmt(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('sv-SE', { timeZone: 'America/Bahia' }); }
  catch { return ''; }
}

// Última posição conhecida do motoboy (para o cliente acompanhar via integração).
async function ultimaPosicao(motoboyId) {
  if (!motoboyId) return null;
  const { rows } = await query(
    `SELECT lat, lng, capturado_em FROM rastreamento
      WHERE motoboy_id = $1 ORDER BY capturado_em DESC LIMIT 1`, [motoboyId]);
  if (!rows[0]) return null;
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lng), em: fmt(rows[0].capturado_em) };
}

// Monta o corpo da notificação para um momento.
function montarPayload({ entrega, momento, ponto, posicao, urlRastreio }) {
  const idStatus = momento; // 0, 0.5, 0.75, 1, 2, 3
  const base = {
    ID: entrega.protocolo,
    Status: {
      ID: Number(idStatus),
      Nome: entrega.motoboy_nome || '',
      telefone: entrega.motoboy_telefone || '',
      dataHora: fmt(new Date()),
    },
    UrlRastreamento: urlRastreio || '',
    coordenadasMotoboy: posicao ? { lat: posicao.lat, lng: posicao.lng, em: posicao.em } : null,
    valorServico: entrega.valor_cliente_cent != null ? Number((entrega.valor_cliente_cent / 100).toFixed(2)) : null,
    valorProfissional: entrega.valor_motoboy_cent != null ? Number((entrega.valor_motoboy_cent / 100).toFixed(2)) : null,
    referenciaExterna: entrega.referencia_externa || '',
  };

  if (momento === '3') {
    base.cancelamento = { descricaoMotivo: entrega.motivo_cancelamento || '', temMulta: false };
    return base;
  }
  if (momento === '1' && ponto) {
    base.statusEndereco = {
      codigo: 'FIN', codigoCompleto: 'FINALIZADO', descricao: 'Endereço finalizado',
      criadoEm: fmt(ponto.finalizado_em || ponto.entregue_em),
      endereco: {
        ponto: ponto.ordem,
        enderecoCompleto: ponto.endereco || '',
        dataColetado: fmt(ponto.entregue_em || ponto.finalizado_em),
        lat: ponto.lat, lng: ponto.lng,
        motivo: {
          tipo: ponto.status === 'insucesso' ? 'erro' : 'sucesso',
          descricao: ponto.ocorrencia_nome || (ponto.status === 'insucesso' ? 'Não entregue' : 'Entregue com sucesso'),
        },
        obs: ponto.observacoes || '',
        numeroNota: ponto.numero_nf || '',
      },
    };
  }
  return base;
}

// Carrega uma entrega + pontos + chave (para reconciliar).
async function carregar(entregaId) {
  const { rows } = await query(
    `SELECT e.*, m.nome_completo AS motoboy_nome, m.telefone_principal AS motoboy_telefone,
            c.id AS chave_id, c.url_notificacao, c.notif_segredo, c.ativa AS chave_ativa
       FROM entregas e
       LEFT JOIN motoboys m ON m.id = e.motoboy_id
       LEFT JOIN integracoes_chaves c ON c.id = e.integracao_chave_id
      WHERE e.id = $1`, [entregaId]);
  if (!rows[0]) return null;
  const { rows: pontos } = await query(
    `SELECT * FROM entregas_pontos WHERE entrega_id = $1 ORDER BY ordem`, [entregaId]);
  return { ...rows[0], pontos };
}

// Momentos "de corrida" (0 / 0.5 / 0.75 / 2 / 3) que a entrega já atingiu.
function momentosAtingidos(e) {
  const ms = [];
  if (e.motoboy_id) ms.push('0');
  if (e.chegada_coleta_em) ms.push('0.5');
  if (e.iniciada_em) ms.push('0.75');
  if (e.status === 'entregue') ms.push('2');
  if (e.status === 'cancelada') ms.push('3');
  return ms;
}

async function registrarLog(d) {
  try {
    await query(
      `INSERT INTO integracoes_notif_log (entrega_id, chave_id, momento, url, status_http, erro)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [d.entregaId, d.chaveId, d.momento, d.url, d.statusHttp || null, d.erro || null]);
  } catch (e) { /* log não bloqueia */ }
}

// Reconciliação principal — chamada pelo cron a cada ~15s.
async function reconciliarWebhooks() {
  // Entregas de integração, com chave ativa e URL configurada, que ainda têm o que
  // notificar: ou estão ativas, ou terminaram há pouco (janela de segurança).
  const { rows: candidatas } = await query(
    `SELECT e.id
       FROM entregas e
       JOIN integracoes_chaves c ON c.id = e.integracao_chave_id
       LEFT JOIN integracoes_notif_estado ne ON ne.entrega_id = e.id
      WHERE e.integracao_chave_id IS NOT NULL
        AND c.ativa = TRUE
        AND c.url_notificacao IS NOT NULL AND c.url_notificacao <> ''
        AND ( e.status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota')
              OR e.criado_em > now() - interval '2 days' )
      ORDER BY e.criado_em DESC
      LIMIT 200`);

  const base = process.env.RASTREIO_BASE_URL || '';
  let enviados = 0;

  for (const c of candidatas) {
    const e = await carregar(c.id);
    if (!e || !e.url_notificacao) continue;

    const { rows: estRows } = await query(
      `SELECT momentos_enviados, pontos_enviados FROM integracoes_notif_estado WHERE entrega_id = $1`, [e.id]);
    const jaMomentos = new Set((estRows[0]?.momentos_enviados) || []);
    const jaPontos = new Set((estRows[0]?.pontos_enviados) || []);

    const urlR = e.rastreio_token && base ? `${base.replace(/\/$/, '')}/rastreio.html?t=${e.rastreio_token}` : '';
    const novosMomentos = [];
    const novosPontos = [];

    // Momentos de corrida
    for (const m of momentosAtingidos(e)) {
      if (jaMomentos.has(m)) continue;
      const posicao = await ultimaPosicao(e.motoboy_id);
      const payload = montarPayload({ entrega: e, momento: m, posicao, urlRastreio: urlR });
      const r = await enviar(e.url_notificacao, payload, e.notif_segredo);
      await registrarLog({ entregaId: e.id, chaveId: e.chave_id, momento: m, url: e.url_notificacao, ...r });
      novosMomentos.push(m); enviados++;
    }

    // Momento 1 por ponto finalizado
    for (const p of (e.pontos || [])) {
      const finalizado = ['entregue', 'insucesso'].includes(p.status) && (p.finalizado_em || p.entregue_em);
      if (!finalizado || jaPontos.has(p.id)) continue;
      const posicao = await ultimaPosicao(e.motoboy_id);
      const payload = montarPayload({ entrega: e, momento: '1', ponto: p, posicao, urlRastreio: urlR });
      const r = await enviar(e.url_notificacao, payload, e.notif_segredo);
      await registrarLog({ entregaId: e.id, chaveId: e.chave_id, momento: '1', url: e.url_notificacao, ...r });
      novosPontos.push(p.id); enviados++;
    }

    if (novosMomentos.length || novosPontos.length) {
      await query(
        `INSERT INTO integracoes_notif_estado (entrega_id, chave_id, momentos_enviados, pontos_enviados, atualizado_em)
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT (entrega_id) DO UPDATE SET
           momentos_enviados = (
             SELECT ARRAY(SELECT DISTINCT unnest(integracoes_notif_estado.momentos_enviados || EXCLUDED.momentos_enviados))),
           pontos_enviados = (
             SELECT ARRAY(SELECT DISTINCT unnest(integracoes_notif_estado.pontos_enviados || EXCLUDED.pontos_enviados))),
           atualizado_em = now()`,
        [e.id, e.chave_id, novosMomentos, novosPontos]);
    }
  }

  if (enviados) console.log(`[integracoes:webhook] ${enviados} notificação(ões) enviada(s)`);
  return enviados;
}

module.exports = { reconciliarWebhooks };

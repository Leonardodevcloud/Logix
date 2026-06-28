const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { registrarAuditoria } = require('../../shared/auditLogger');

// ── Categorias de Frete ──────────────────────────────────────────────

// Lista as categorias da empresa, cada uma com os clientes (lojas) vinculados.
async function listarCategorias({ empresaId, incluirInativas = true }) {
  const cond = ['c.empresa_id = $1'];
  const params = [empresaId];
  if (!incluirInativas) cond.push('c.ativo = TRUE');

  const { rows } = await query(
    `SELECT c.id, c.nome, c.cor, c.descricao, c.ativo, c.criado_em,
            COALESCE(
              (SELECT json_agg(json_build_object('id', l.id, 'nome', l.nome_fantasia) ORDER BY l.nome_fantasia)
                 FROM frete_categoria_lojas fcl
                 JOIN lojas l ON l.id = fcl.loja_id
                WHERE fcl.categoria_id = c.id),
              '[]'::json
            ) AS lojas
       FROM frete_categorias c
      WHERE ${cond.join(' AND ')}
      ORDER BY c.ativo DESC, c.nome ASC`,
    params
  );
  return rows;
}

async function obterCategoria({ empresaId, id }) {
  const { rows } = await query(
    `SELECT id, nome, cor, descricao, ativo, criado_em FROM frete_categorias WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Categoria não encontrada');
  const { rows: lojas } = await query(
    `SELECT l.id, l.nome_fantasia AS nome FROM frete_categoria_lojas fcl
       JOIN lojas l ON l.id = fcl.loja_id
      WHERE fcl.categoria_id = $1 ORDER BY l.nome_fantasia`,
    [id]
  );
  return { ...rows[0], lojas };
}

// Cria uma categoria. lojaIds (opcional) = clientes vinculados.
async function criarCategoria({ empresaId, nome, cor, descricao, lojaIds = [], usuarioId, ip }) {
  if (!nome || !nome.trim()) throw AppError.validacao('Informe o nome da categoria');
  const corFinal = (cor && /^#[0-9a-fA-F]{6}$/.test(cor)) ? cor : '#7c3aed';

  let row;
  try {
    const r = await query(
      `INSERT INTO frete_categorias (empresa_id, nome, cor, descricao)
       VALUES ($1, $2, $3, $4) RETURNING id, nome, cor, descricao, ativo, criado_em`,
      [empresaId, nome.trim(), corFinal, descricao || null]
    );
    row = r.rows[0];
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Já existe uma categoria com esse nome');
    throw e;
  }

  await vincularLojas(empresaId, row.id, lojaIds);
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'criar_categoria_frete', detalhe: { id: row.id, nome: row.nome }, ip }).catch(() => {});
  return obterCategoria({ empresaId, id: row.id });
}

// Atualiza nome/cor/descrição e, se vier lojaIds, redefine os clientes vinculados.
async function atualizarCategoria({ empresaId, id, nome, cor, descricao, lojaIds, usuarioId, ip }) {
  const { rows: existe } = await query(`SELECT id FROM frete_categorias WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!existe[0]) throw AppError.naoEncontrado('Categoria não encontrada');

  const sets = [], params = [];
  if (nome != null) { if (!nome.trim()) throw AppError.validacao('Nome inválido'); params.push(nome.trim()); sets.push(`nome = $${params.length}`); }
  if (cor != null) { const c = /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#7c3aed'; params.push(c); sets.push(`cor = $${params.length}`); }
  if (descricao !== undefined) { params.push(descricao || null); sets.push(`descricao = $${params.length}`); }
  if (sets.length) {
    sets.push(`atualizado_em = now()`);
    params.push(id, empresaId);
    try {
      await query(`UPDATE frete_categorias SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND empresa_id = $${params.length}`, params);
    } catch (e) {
      if (e.code === '23505') throw AppError.conflito('Já existe uma categoria com esse nome');
      throw e;
    }
  }

  if (Array.isArray(lojaIds)) {
    await query(`DELETE FROM frete_categoria_lojas WHERE categoria_id = $1`, [id]);
    await vincularLojas(empresaId, id, lojaIds);
  }
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'editar_categoria_frete', detalhe: { id }, ip }).catch(() => {});
  return obterCategoria({ empresaId, id });
}

// Ativa/desativa.
async function alternarCategoria({ empresaId, id, ativo, usuarioId, ip }) {
  const { rows } = await query(
    `UPDATE frete_categorias SET ativo = $3, atualizado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING id, ativo`,
    [id, empresaId, !!ativo]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Categoria não encontrada');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'alternar_categoria_frete', detalhe: { id, ativo: !!ativo }, ip }).catch(() => {});
  return rows[0];
}

async function excluirCategoria({ empresaId, id, usuarioId, ip }) {
  const { rows } = await query(`DELETE FROM frete_categorias WHERE id = $1 AND empresa_id = $2 RETURNING id`, [id, empresaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Categoria não encontrada');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'excluir_categoria_frete', detalhe: { id }, ip }).catch(() => {});
  return { ok: true };
}

// Vincula uma lista de lojas a uma categoria (valida que as lojas são da empresa).
async function vincularLojas(empresaId, categoriaId, lojaIds) {
  if (!Array.isArray(lojaIds) || !lojaIds.length) return;
  // Filtra apenas lojas que pertencem à empresa.
  const { rows: validas } = await query(
    `SELECT id FROM lojas WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
    [empresaId, lojaIds]
  );
  for (const l of validas) {
    await query(
      `INSERT INTO frete_categoria_lojas (categoria_id, loja_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [categoriaId, l.id]
    );
  }
}

// ── Ocorrências de marcação ──────────────────────────────────────────
async function listarOcorrencias({ empresaId, incluirInativas = true }) {
  const cond = ['empresa_id = $1'];
  if (!incluirInativas) cond.push('ativo = TRUE');
  const { rows } = await query(
    `SELECT id, nome, tipo, comportamento, ordem, ativo FROM ocorrencias_marcacao
      WHERE ${cond.join(' AND ')} ORDER BY ordem, nome`,
    [empresaId]
  );
  return rows;
}

async function criarOcorrencia({ empresaId, nome, tipo, comportamento, usuarioId, ip }) {
  if (!nome || !nome.trim()) throw AppError.validacao('Nome é obrigatório');
  const t = tipo === 'insucesso' ? 'insucesso' : 'sucesso';
  // Sucesso sempre finaliza; insucesso pode finalizar ou gerar retorno.
  const comp = t === 'sucesso' ? 'finalizar' : (comportamento === 'retorno' ? 'retorno' : 'finalizar');
  const { rows: ord } = await query(`SELECT COALESCE(MAX(ordem),0)+1 AS prox FROM ocorrencias_marcacao WHERE empresa_id = $1`, [empresaId]);
  const { rows } = await query(
    `INSERT INTO ocorrencias_marcacao (empresa_id, nome, tipo, comportamento, ordem)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, tipo, comportamento, ordem, ativo`,
    [empresaId, nome.trim(), t, comp, ord[0].prox]
  );
  return rows[0];
}

async function atualizarOcorrencia({ empresaId, id, nome, tipo, comportamento, ativo, usuarioId, ip }) {
  const t = tipo === 'insucesso' ? 'insucesso' : 'sucesso';
  const comp = t === 'sucesso' ? 'finalizar' : (comportamento === 'retorno' ? 'retorno' : 'finalizar');
  const { rows } = await query(
    `UPDATE ocorrencias_marcacao SET nome = COALESCE($3, nome), tipo = $4, comportamento = $5,
            ativo = COALESCE($6, ativo)
      WHERE id = $1 AND empresa_id = $2
      RETURNING id, nome, tipo, comportamento, ordem, ativo`,
    [id, empresaId, nome ? nome.trim() : null, t, comp, typeof ativo === 'boolean' ? ativo : null]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Ocorrência não encontrada');
  return rows[0];
}

async function excluirOcorrencia({ empresaId, id }) {
  const { rowCount } = await query(`DELETE FROM ocorrencias_marcacao WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!rowCount) throw AppError.naoEncontrado('Ocorrência não encontrada');
  return { ok: true };
}

module.exports = {
  listarCategorias, obterCategoria, criarCategoria, atualizarCategoria,
  alternarCategoria, excluirCategoria,
  obterSla, salvarSla, removerSlaLoja, slaEfetivoCliente,
  obterValores, salvarValores, removerValoresLoja, precificar,
  listarOcorrencias, criarOcorrencia, atualizarOcorrencia, excluirOcorrencia,
};

// ── Configuração de SLA (global e por cliente) ───────────────────────
// faixas: [{ ate_km, minutos }]. loja_id NULL = config global da empresa.

const FAIXAS_PADRAO = [
  { ate_km: 3, minutos: 60 },
  { ate_km: 7, minutos: 90 },
  { ate_km: 15, minutos: 120 },
  { ate_km: 9999, minutos: 180 },
];

function normalizarFaixas(faixas) {
  if (!Array.isArray(faixas)) return [];
  return faixas
    .map(f => ({ ate_km: Number(f.ate_km), minutos: Math.round(Number(f.minutos)) }))
    .filter(f => Number.isFinite(f.ate_km) && f.ate_km > 0 && Number.isFinite(f.minutos) && f.minutos > 0)
    .sort((a, b) => a.ate_km - b.ate_km);
}

// Obtém a config de SLA. lojaId NULL = global. Se a loja não tiver config própria,
// retorna { tem_propria: false } + a global (para a tela mostrar o que está valendo).
async function obterSla({ empresaId, lojaId = null }) {
  if (lojaId) {
    const { rows } = await query(
      `SELECT faixas, minutos_atencao, minutos_iminente, sla_padrao_min
         FROM sla_config WHERE empresa_id = $1 AND loja_id = $2`,
      [empresaId, lojaId]
    );
    const global = await obterSla({ empresaId, lojaId: null });
    if (rows[0]) return { tem_propria: true, ...rows[0], global };
    return { tem_propria: false, ...global, global };
  }
  // Global
  const { rows } = await query(
    `SELECT faixas, minutos_atencao, minutos_iminente, sla_padrao_min
       FROM sla_config WHERE empresa_id = $1 AND loja_id IS NULL`,
    [empresaId]
  );
  if (rows[0]) return rows[0];
  return { faixas: FAIXAS_PADRAO, minutos_atencao: 30, minutos_iminente: 15, sla_padrao_min: 90 };
}

// Salva (cria/atualiza) a config de SLA. lojaId NULL = global; com lojaId = sobrescreve só aquele cliente.
async function salvarSla({ empresaId, lojaId = null, faixas, minutosAtencao, minutosIminente, slaPadraoMin, usuarioId, ip }) {
  const f = normalizarFaixas(faixas);
  if (!f.length) throw AppError.validacao('Informe ao menos uma faixa de km → minutos');
  const atencao = Number.isFinite(+minutosAtencao) ? Math.max(1, Math.round(+minutosAtencao)) : 30;
  const iminente = Number.isFinite(+minutosIminente) ? Math.max(1, Math.round(+minutosIminente)) : 15;
  const padrao = Number.isFinite(+slaPadraoMin) ? Math.max(1, Math.round(+slaPadraoMin)) : 90;

  if (lojaId) {
    const loja = await query(`SELECT id FROM lojas WHERE id = $1 AND empresa_id = $2`, [lojaId, empresaId]);
    if (!loja.rows[0]) throw AppError.naoEncontrado('Cliente não encontrado');
    await query(
      `INSERT INTO sla_config (empresa_id, loja_id, faixas, minutos_atencao, minutos_iminente, sla_padrao_min, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (empresa_id, loja_id) WHERE loja_id IS NOT NULL
       DO UPDATE SET faixas = $3, minutos_atencao = $4, minutos_iminente = $5, sla_padrao_min = $6, atualizado_em = now()`,
      [empresaId, lojaId, JSON.stringify(f), atencao, iminente, padrao]
    );
  } else {
    await query(
      `INSERT INTO sla_config (empresa_id, loja_id, faixas, minutos_atencao, minutos_iminente, sla_padrao_min, atualizado_em)
       VALUES ($1, NULL, $2,$3,$4,$5, now())
       ON CONFLICT (empresa_id) WHERE loja_id IS NULL
       DO UPDATE SET faixas = $2, minutos_atencao = $3, minutos_iminente = $4, sla_padrao_min = $5, atualizado_em = now()`,
      [empresaId, JSON.stringify(f), atencao, iminente, padrao]
    );
  }
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: lojaId ? 'salvar_sla_cliente' : 'salvar_sla_global', detalhe: { lojaId }, ip }).catch(() => {});
  return { ok: true, faixas: f, minutos_atencao: atencao, minutos_iminente: iminente, sla_padrao_min: padrao };
}

// Remove a config de SLA de uma loja (ela volta a usar a global).
async function removerSlaLoja({ empresaId, lojaId, usuarioId, ip }) {
  await query(`DELETE FROM sla_config WHERE empresa_id = $1 AND loja_id = $2`, [empresaId, lojaId]);
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'remover_sla_cliente', detalhe: { lojaId }, ip }).catch(() => {});
  return { ok: true };
}

// Atalho usado por outros módulos: SLA efetivo de um cliente (próprio ou global).
async function slaEfetivoCliente({ empresaId, lojaId }) {
  const r = await obterSla({ empresaId, lojaId });
  return { faixas: r.faixas, minutos_atencao: r.minutos_atencao, minutos_iminente: r.minutos_iminente, sla_padrao_min: r.sla_padrao_min, tem_propria: !!r.tem_propria };
}

// ── Tabela de Valores (precificação por km) ──────────────────────
// faixas: [{ ate_km, valor_cliente_cent, valor_motoboy_cent }] (centavos, inteiro).

const FAIXAS_VALOR_PADRAO = [
  { ate_km: 3, valor_cliente_cent: 900, valor_motoboy_cent: 700 },
  { ate_km: 7, valor_cliente_cent: 1300, valor_motoboy_cent: 1000 },
  { ate_km: 15, valor_cliente_cent: 1900, valor_motoboy_cent: 1500 },
  { ate_km: 9999, valor_cliente_cent: 2900, valor_motoboy_cent: 2300 },
];

function normalizarFaixasValor(faixas) {
  if (!Array.isArray(faixas)) return [];
  return faixas
    .map(f => ({
      ate_km: Number(f.ate_km),
      valor_cliente_cent: Math.max(0, Math.round(Number(f.valor_cliente_cent))),
      valor_motoboy_cent: Math.max(0, Math.round(Number(f.valor_motoboy_cent))),
    }))
    .filter(f => Number.isFinite(f.ate_km) && f.ate_km > 0 && Number.isFinite(f.valor_cliente_cent) && Number.isFinite(f.valor_motoboy_cent))
    .sort((a, b) => a.ate_km - b.ate_km);
}

// Obtém a tabela de valores. lojaId NULL = global. Para loja sem tabela própria,
// retorna { tem_propria: false } + a global.
async function obterValores({ empresaId, lojaId = null }) {
  if (lojaId) {
    const { rows } = await query(
      `SELECT faixas, cobranca_ativa FROM valores_config WHERE empresa_id = $1 AND loja_id = $2`,
      [empresaId, lojaId]
    );
    const global = await obterValores({ empresaId, lojaId: null });
    if (rows[0]) return { tem_propria: true, faixas: rows[0].faixas, cobranca_ativa: rows[0].cobranca_ativa, global };
    return { tem_propria: false, faixas: global.faixas, cobranca_ativa: true, global };
  }
  const { rows } = await query(
    `SELECT faixas, cobranca_ativa FROM valores_config WHERE empresa_id = $1 AND loja_id IS NULL`,
    [empresaId]
  );
  if (rows[0]) return { faixas: rows[0].faixas, cobranca_ativa: rows[0].cobranca_ativa };
  return { faixas: FAIXAS_VALOR_PADRAO, cobranca_ativa: true };
}

// Salva a tabela de valores. lojaId NULL = global; com lojaId = sobrescreve o cliente.
// cobrancaAtiva só é relevante no nível do cliente.
async function salvarValores({ empresaId, lojaId = null, faixas, cobrancaAtiva = true, usuarioId, ip }) {
  const cobra = cobrancaAtiva !== false;
  const f = normalizarFaixasValor(faixas);
  // Faixas só são obrigatórias quando a cobrança está ativa. Com cobrança desligada
  // (só faz sentido por cliente), salvamos as faixas que vierem (mesmo vazias).
  if (cobra && !f.length) throw AppError.validacao('Informe ao menos uma faixa de km com valores');

  if (lojaId) {
    const loja = await query(`SELECT id FROM lojas WHERE id = $1 AND empresa_id = $2`, [lojaId, empresaId]);
    if (!loja.rows[0]) throw AppError.naoEncontrado('Cliente não encontrado');
    await query(
      `INSERT INTO valores_config (empresa_id, loja_id, faixas, cobranca_ativa, atualizado_em)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (empresa_id, loja_id) WHERE loja_id IS NOT NULL
       DO UPDATE SET faixas = $3, cobranca_ativa = $4, atualizado_em = now()`,
      [empresaId, lojaId, JSON.stringify(f), cobra]
    );
  } else {
    await query(
      `INSERT INTO valores_config (empresa_id, loja_id, faixas, cobranca_ativa, atualizado_em)
       VALUES ($1, NULL, $2, TRUE, now())
       ON CONFLICT (empresa_id) WHERE loja_id IS NULL
       DO UPDATE SET faixas = $2, atualizado_em = now()`,
      [empresaId, JSON.stringify(f)]
    );
  }
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: lojaId ? 'salvar_valores_cliente' : 'salvar_valores_global', detalhe: { lojaId, cobra }, ip }).catch(() => {});
  return { ok: true, faixas: f, cobranca_ativa: cobra };
}

// Remove a tabela de valores de um cliente (volta a usar a global).
async function removerValoresLoja({ empresaId, lojaId, usuarioId, ip }) {
  await query(`DELETE FROM valores_config WHERE empresa_id = $1 AND loja_id = $2`, [empresaId, lojaId]);
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'remover_valores_cliente', detalhe: { lojaId }, ip }).catch(() => {});
  return { ok: true };
}

// Calcula o valor (cliente e motoboy) de uma corrida dado o km e o cliente.
// Respeita a tabela própria do cliente e o toggle de cobrança. Usado ao criar entrega.
async function precificar({ empresaId, lojaId, km }) {
  const cfg = await obterValores({ empresaId, lojaId: lojaId || null });
  // Cliente com cobrança desligada → tudo zero.
  if (lojaId && cfg.tem_propria && cfg.cobranca_ativa === false) {
    return { valor_cliente_cent: 0, valor_motoboy_cent: 0, cobranca_ativa: false };
  }
  const faixas = normalizarFaixasValor(cfg.faixas);
  if (!faixas.length || km == null) return { valor_cliente_cent: 0, valor_motoboy_cent: 0, cobranca_ativa: true };
  const faixa = faixas.find(f => km <= f.ate_km) || faixas[faixas.length - 1];
  return { valor_cliente_cent: faixa.valor_cliente_cent, valor_motoboy_cent: faixa.valor_motoboy_cent, cobranca_ativa: true };
}

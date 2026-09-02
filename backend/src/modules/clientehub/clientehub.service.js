const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { PERFIS } = require('../../shared/constants');
const authService = require('../auth/auth.service');
// Geocoder (ORS) para localizar os endereços de centro de custo no mapa.
let geocodificar = null;
try { geocodificar = require('../../integracoes/openrouteservice').geocodificar; } catch {}

// Garante que a loja pertence à empresa (evita acesso cruzado).
async function exigirLoja(empresaId, lojaId) {
  const { rows } = await query(`SELECT id, nome_fantasia FROM lojas WHERE id = $1 AND empresa_id = $2`, [lojaId, empresaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Cliente não encontrado');
  return rows[0];
}

// ── 1) Status do cliente (ativar/desativar) ───────────────────────
async function alternarStatus({ empresaId, lojaId, ativo, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  await query(`UPDATE lojas SET ativo = $3, atualizado_em = now() WHERE id = $1 AND empresa_id = $2`, [lojaId, empresaId, !!ativo]);
  // Ao desativar, invalida todos os usuários (e subusuários) do cliente.
  if (!ativo) {
    await query(`UPDATE usuarios SET ativo = FALSE WHERE loja_id = $1`, [lojaId]);
  } else {
    // Ao reativar, reativa os usuários do cliente.
    await query(`UPDATE usuarios SET ativo = TRUE WHERE loja_id = $1`, [lojaId]);
  }
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: ativo ? 'ativar' : 'desativar', detalhe: { lojaId }, ip }).catch(() => {});
  return { ok: true, ativo: !!ativo };
}

// ── 2) Centros de custo ───────────────────────────────────────────
async function listarCentros({ empresaId, lojaId }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(
    `SELECT cc.id, cc.nome, cc.codigo, cc.ativo, cc.criado_em, cc.endereco, cc.lat, cc.lng,
            COALESCE((SELECT count(*)::int FROM cliente_centro_usuarios ccu WHERE ccu.centro_id = cc.id), 0) AS total_usuarios
       FROM cliente_centros_custo cc
      WHERE cc.loja_id = $1 ORDER BY cc.nome`,
    [lojaId]
  );
  return rows;
}

async function criarCentro({ empresaId, lojaId, nome, codigo, endereco, lat, lng, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  if (!nome || !nome.trim()) throw AppError.validacao('Informe o nome do centro de custo');
  // Coordenadas: usa as do pin (frontend) se vierem; senão geocodifica o endereço.
  let flat = null, flng = null;
  const end = endereco && endereco.trim() ? endereco.trim() : null;
  if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
    flat = Number(lat); flng = Number(lng);
  } else if (end && geocodificar) {
    try { const g = await geocodificar(end); flat = g.lat; flng = g.lng; } catch {}
  }
  const { rows } = await query(
    `INSERT INTO cliente_centros_custo (empresa_id, loja_id, nome, codigo, endereco, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, nome, codigo, ativo, criado_em, endereco, lat, lng`,
    [empresaId, lojaId, nome.trim(), codigo || null, end, flat, flng]
  );
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'criar_centro_custo', detalhe: { lojaId, id: rows[0].id }, ip }).catch(() => {});
  return rows[0];
}

async function atualizarCentro({ empresaId, lojaId, id, nome, codigo, ativo, endereco, lat, lng, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const sets = [], params = [];
  if (nome != null) { params.push(nome.trim()); sets.push(`nome = $${params.length}`); }
  if (codigo !== undefined) { params.push(codigo || null); sets.push(`codigo = $${params.length}`); }
  if (ativo != null) { params.push(!!ativo); sets.push(`ativo = $${params.length}`); }
  // Endereço mudou: usa coords do pin se vierem; senão regeocodifica. Vazio limpa lat/lng.
  if (endereco !== undefined) {
    const end = endereco && endereco.trim() ? endereco.trim() : null;
    let flat = null, flng = null;
    if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      flat = Number(lat); flng = Number(lng);
    } else if (end && geocodificar) {
      try { const g = await geocodificar(end); flat = g.lat; flng = g.lng; } catch {}
    }
    params.push(end); sets.push(`endereco = $${params.length}`);
    params.push(flat); sets.push(`lat = $${params.length}`);
    params.push(flng); sets.push(`lng = $${params.length}`);
  }
  if (!sets.length) return { ok: true };
  params.push(id, lojaId);
  const { rows } = await query(
    `UPDATE cliente_centros_custo SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND loja_id = $${params.length} RETURNING id`,
    params
  );
  if (!rows[0]) throw AppError.naoEncontrado('Centro de custo não encontrado');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'editar_centro_custo', detalhe: { lojaId, id }, ip }).catch(() => {});
  return { ok: true };
}

async function excluirCentro({ empresaId, lojaId, id, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(`DELETE FROM cliente_centros_custo WHERE id = $1 AND loja_id = $2 RETURNING id`, [id, lojaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Centro de custo não encontrado');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'excluir_centro_custo', detalhe: { lojaId, id }, ip }).catch(() => {});
  return { ok: true };
}

// Cria um usuário já vinculado a um centro de custo do cliente.
async function criarUsuarioCentro({ empresaId, lojaId, centroId, nome, email, telefone, senha, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  if (!nome || !email || !senha) throw AppError.validacao('Nome, e-mail e senha são obrigatórios');
  const centro = await query(`SELECT id FROM cliente_centros_custo WHERE id = $1 AND loja_id = $2`, [centroId, lojaId]);
  if (!centro.rows[0]) throw AppError.naoEncontrado('Centro de custo não encontrado');

  let papelId = null;
  try { papelId = await require('../permissoes/permissoes.service').idDoTemplate('Loja'); } catch {}
  let novo;
  try {
    novo = await authService.criarUsuario({ empresaId, lojaId, perfil: PERFIS.LOJA, nome, email, telefone: telefone || null, senha, papelId });
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Já existe um usuário com esse e-mail');
    throw e;
  }
  await query(`INSERT INTO cliente_centro_usuarios (centro_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [centroId, novo.id]);
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'criar_usuario_centro', detalhe: { lojaId, centroId, usuario: novo.id }, ip }).catch(() => {});
  return novo;
}

// ── 3) Usuários avulsos do cliente ────────────────────────────────
async function listarUsuarios({ empresaId, lojaId }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(
    `SELECT id, nome, email, telefone, ativo, ultimo_acesso, criado_em
       FROM usuarios WHERE loja_id = $1 AND perfil = $2 ORDER BY nome`,
    [lojaId, PERFIS.LOJA]
  );
  return rows;
}

// Usuários vinculados a UM centro de custo.
async function listarUsuariosCentro({ empresaId, lojaId, centroId }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(
    `SELECT u.id, u.nome, u.email, u.telefone, u.ativo, u.ultimo_acesso
       FROM cliente_centro_usuarios ccu
       JOIN usuarios u ON u.id = ccu.usuario_id
      WHERE ccu.centro_id = $1 AND u.loja_id = $2
      ORDER BY u.nome`,
    [centroId, lojaId]
  );
  return rows;
}

async function criarUsuario({ empresaId, lojaId, nome, email, telefone, senha, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  if (!nome || !email || !senha) throw AppError.validacao('Nome, e-mail e senha são obrigatórios');
  let papelId = null;
  try { papelId = await require('../permissoes/permissoes.service').idDoTemplate('Loja'); } catch {}
  let novo;
  try {
    novo = await authService.criarUsuario({ empresaId, lojaId, perfil: PERFIS.LOJA, nome, email, telefone: telefone || null, senha, papelId });
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Já existe um usuário com esse e-mail');
    throw e;
  }
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'criar_usuario', detalhe: { lojaId, usuario: novo.id }, ip }).catch(() => {});
  return novo;
}

async function atualizarUsuario({ empresaId, lojaId, id, nome, telefone, ativo, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const sets = [], params = [];
  if (nome != null) { params.push(nome.trim()); sets.push(`nome = $${params.length}`); }
  if (telefone !== undefined) { params.push(telefone || null); sets.push(`telefone = $${params.length}`); }
  if (ativo != null) { params.push(!!ativo); sets.push(`ativo = $${params.length}`); }
  if (!sets.length) return { ok: true };
  params.push(id, lojaId);
  const { rows } = await query(
    `UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND loja_id = $${params.length} RETURNING id`,
    params
  );
  if (!rows[0]) throw AppError.naoEncontrado('Usuário não encontrado');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'editar_usuario', detalhe: { lojaId, id }, ip }).catch(() => {});
  return { ok: true };
}

async function excluirUsuario({ empresaId, lojaId, id, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(`DELETE FROM usuarios WHERE id = $1 AND loja_id = $2 AND perfil = $3 RETURNING id`, [id, lojaId, PERFIS.LOJA]);
  if (!rows[0]) throw AppError.naoEncontrado('Usuário não encontrado');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'excluir_usuario', detalhe: { lojaId, id }, ip }).catch(() => {});
  return { ok: true };
}

// ── 4) Modalidades de frete do cliente ────────────────────────────
async function listarModalidades({ empresaId, lojaId }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(
    `SELECT cm.id, cm.categoria_id, cm.so_exclusivos, cm.ativo, c.nome, c.cor
       FROM cliente_modalidades cm
       JOIN frete_categorias c ON c.id = cm.categoria_id
      WHERE cm.loja_id = $1 ORDER BY c.nome`,
    [lojaId]
  );
  return rows;
}

// Lista as categorias disponíveis (ativas da empresa) para vincular.
async function categoriasDisponiveis({ empresaId, lojaId }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(
    `SELECT c.id, c.nome, c.cor,
            EXISTS(SELECT 1 FROM cliente_modalidades cm WHERE cm.loja_id = $2 AND cm.categoria_id = c.id) AS vinculada
       FROM frete_categorias c
      WHERE c.empresa_id = $1 AND c.ativo = TRUE ORDER BY c.nome`,
    [empresaId, lojaId]
  );
  return rows;
}

async function adicionarModalidade({ empresaId, lojaId, categoriaId, soExclusivos, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const cat = await query(`SELECT id FROM frete_categorias WHERE id = $1 AND empresa_id = $2`, [categoriaId, empresaId]);
  if (!cat.rows[0]) throw AppError.naoEncontrado('Categoria não encontrada');
  try {
    const { rows } = await query(
      `INSERT INTO cliente_modalidades (empresa_id, loja_id, categoria_id, so_exclusivos)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [empresaId, lojaId, categoriaId, !!soExclusivos]
    );
    registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'add_modalidade', detalhe: { lojaId, categoriaId }, ip }).catch(() => {});
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Essa modalidade já está vinculada ao cliente');
    throw e;
  }
}

async function atualizarModalidade({ empresaId, lojaId, id, soExclusivos, ativo, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const sets = [], params = [];
  if (soExclusivos != null) { params.push(!!soExclusivos); sets.push(`so_exclusivos = $${params.length}`); }
  if (ativo != null) { params.push(!!ativo); sets.push(`ativo = $${params.length}`); }
  if (!sets.length) return { ok: true };
  params.push(id, lojaId);
  const { rows } = await query(`UPDATE cliente_modalidades SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND loja_id = $${params.length} RETURNING id`, params);
  if (!rows[0]) throw AppError.naoEncontrado('Modalidade não encontrada');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'editar_modalidade', detalhe: { lojaId, id }, ip }).catch(() => {});
  return { ok: true };
}

async function removerModalidade({ empresaId, lojaId, id, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(`DELETE FROM cliente_modalidades WHERE id = $1 AND loja_id = $2 RETURNING id`, [id, lojaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Modalidade não encontrada');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'remover_modalidade', detalhe: { lojaId, id }, ip }).catch(() => {});
  return { ok: true };
}

// ── 5) Regras de acionamento ──────────────────────────────────────
async function obterRegras({ empresaId, lojaId }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(
    `SELECT max_corridas_motoboy, raio_km, pode_cancelar_associada, pode_alterar_profissional,
            pode_editar_servico, pode_escolher_profissional, somente_online,
            marcacao_raio_livre, marcacao_raio_km, marcacao_modalidade_ids,
            prioridade_nivel_ativa, prioridade_onda_seg, prioridade_ondas
       FROM cliente_regras_acionamento WHERE loja_id = $1`,
    [lojaId]
  );
  if (rows[0]) return rows[0];
  // default (não persiste até salvar) — tudo permissivo
  return {
    max_corridas_motoboy: 3, raio_km: 5,
    pode_cancelar_associada: true, pode_alterar_profissional: true,
    pode_editar_servico: true, pode_escolher_profissional: true, somente_online: true,
    marcacao_raio_livre: true, marcacao_raio_km: 0.3, marcacao_modalidade_ids: [],
    prioridade_nivel_ativa: false, prioridade_onda_seg: 15,
    prioridade_ondas: [['Diamante', 'Ouro'], ['Prata'], ['Bronze']],
  };
}

async function salvarRegras({ empresaId, lojaId, maxCorridas, raioKm, booleanos = {}, marcacaoRaioLivre, marcacaoRaioKm, marcacaoModalidadeIds, prioridade = {}, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const max = Number.isFinite(+maxCorridas) ? Math.max(1, Math.round(+maxCorridas)) : 3;
  const raio = Number.isFinite(+raioKm) ? Math.max(0.5, +raioKm) : 5;
  // normaliza booleanos (mantém o que veio; default true)
  const b = {
    pode_cancelar_associada: booleanos.pode_cancelar_associada !== false,
    pode_alterar_profissional: booleanos.pode_alterar_profissional !== false,
    pode_editar_servico: booleanos.pode_editar_servico !== false,
    pode_escolher_profissional: booleanos.pode_escolher_profissional !== false,
    somente_online: booleanos.somente_online !== false,
  };
  // Geofence de marcação: raio livre (default true) e raio em km (default 0.3).
  const marcLivre = marcacaoRaioLivre !== false;
  const marcRaio = Number.isFinite(+marcacaoRaioKm) ? Math.max(0.05, +marcacaoRaioKm) : 0.3;
  // Modalidades alvo (array de ids). Vazio/ inválido = todas.
  const marcMods = Array.isArray(marcacaoModalidadeIds) ? marcacaoModalidadeIds.filter(x => typeof x === 'string') : [];
  // Prioridade por nível (opt-in, default off).
  const prioAtiva = prioridade.ativa === true;
  const prioSeg = Number.isFinite(+prioridade.onda_seg) ? Math.max(3, Math.round(+prioridade.onda_seg)) : 15;
  const prioOndas = Array.isArray(prioridade.ondas) && prioridade.ondas.length
    ? prioridade.ondas.map(g => (Array.isArray(g) ? g.filter(x => typeof x === 'string' && x.trim()) : [])).filter(g => g.length)
    : [['Diamante', 'Ouro'], ['Prata'], ['Bronze']];
  await query(
    `INSERT INTO cliente_regras_acionamento
       (loja_id, empresa_id, max_corridas_motoboy, raio_km,
        pode_cancelar_associada, pode_alterar_profissional, pode_editar_servico,
        pode_escolher_profissional, somente_online, marcacao_raio_livre, marcacao_raio_km, marcacao_modalidade_ids,
        prioridade_nivel_ativa, prioridade_onda_seg, prioridade_ondas, atualizado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb, now())
     ON CONFLICT (loja_id) DO UPDATE SET
       max_corridas_motoboy = $3, raio_km = $4,
       pode_cancelar_associada = $5, pode_alterar_profissional = $6, pode_editar_servico = $7,
       pode_escolher_profissional = $8, somente_online = $9,
       marcacao_raio_livre = $10, marcacao_raio_km = $11, marcacao_modalidade_ids = $12,
       prioridade_nivel_ativa = $13, prioridade_onda_seg = $14, prioridade_ondas = $15::jsonb, atualizado_em = now()`,
    [lojaId, empresaId, max, raio, b.pode_cancelar_associada, b.pode_alterar_profissional,
     b.pode_editar_servico, b.pode_escolher_profissional, b.somente_online, marcLivre, marcRaio, JSON.stringify(marcMods),
     prioAtiva, prioSeg, JSON.stringify(prioOndas)]
  );
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'salvar_regras_acionamento', detalhe: { lojaId, max, raio, ...b, marcLivre, marcRaio, marcMods, prioAtiva, prioSeg }, ip }).catch(() => {});
  return { ok: true, max_corridas_motoboy: max, raio_km: raio, ...b, marcacao_raio_livre: marcLivre, marcacao_raio_km: marcRaio, marcacao_modalidade_ids: marcMods, prioridade_nivel_ativa: prioAtiva, prioridade_onda_seg: prioSeg, prioridade_ondas: prioOndas };
}

// ── 6) Motoboys exclusivos do cliente (por modalidade) ────────────
async function listarMotoboysExclusivos({ empresaId, lojaId }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(
    `SELECT cmb.id, cmb.motoboy_id, cmb.modalidade_id, cmb.centro_id,
            m.nome_completo, m.codigo, m.online,
            c.nome AS modalidade_nome, c.cor AS modalidade_cor,
            cc.nome AS centro_nome
       FROM cliente_motoboys cmb
       JOIN motoboys m ON m.id = cmb.motoboy_id
       LEFT JOIN cliente_modalidades cm ON cm.id = cmb.modalidade_id
       LEFT JOIN frete_categorias c ON c.id = cm.categoria_id
       LEFT JOIN cliente_centros_custo cc ON cc.id = cmb.centro_id
      WHERE cmb.loja_id = $1 ORDER BY m.codigo`,
    [lojaId]
  );
  return rows;
}

async function atribuirMotoboy({ empresaId, lojaId, motoboyId, modalidadeId, centroId, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const mb = await query(`SELECT id FROM motoboys WHERE id = $1 AND empresa_id = $2`, [motoboyId, empresaId]);
  if (!mb.rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
  if (modalidadeId) {
    const md = await query(`SELECT id FROM cliente_modalidades WHERE id = $1 AND loja_id = $2`, [modalidadeId, lojaId]);
    if (!md.rows[0]) throw AppError.validacao('Modalidade inválida para este cliente');
  }
  if (centroId) {
    const cc = await query(`SELECT id FROM cliente_centros_custo WHERE id = $1 AND loja_id = $2`, [centroId, lojaId]);
    if (!cc.rows[0]) throw AppError.validacao('Centro de custo inválido para este cliente');
  }
  try {
    const { rows } = await query(
      `INSERT INTO cliente_motoboys (empresa_id, loja_id, motoboy_id, modalidade_id, centro_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [empresaId, lojaId, motoboyId, modalidadeId || null, centroId || null]
    );
    registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'atribuir_motoboy', detalhe: { lojaId, motoboyId, modalidadeId, centroId }, ip }).catch(() => {});
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Esse motoboy já está atribuído nessa modalidade/centro');
    throw e;
  }
}

async function removerMotoboy({ empresaId, lojaId, id, usuarioId, ip }) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(`DELETE FROM cliente_motoboys WHERE id = $1 AND loja_id = $2 RETURNING id`, [id, lojaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Atribuição não encontrada');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'remover_motoboy', detalhe: { lojaId, id }, ip }).catch(() => {});
  return { ok: true };
}

// Lista os motoboys da empresa (para o seletor de atribuição).
async function motoboysDisponiveis({ empresaId }) {
  const { rows } = await query(
    `SELECT id, codigo, nome_completo, online FROM motoboys WHERE empresa_id = $1 AND status = 'ativo' ORDER BY codigo`,
    [empresaId]
  );
  return rows;
}

// ── Contexto para criação de entrega ──────────────────────────────
// Modalidades ATIVAS de uma loja (para o seletor ao criar entrega).
async function modalidadesAtivasLoja({ empresaId, lojaId }) {
  const { rows } = await query(
    `SELECT cm.id, cm.categoria_id, c.nome, c.cor
       FROM cliente_modalidades cm
       JOIN frete_categorias c ON c.id = cm.categoria_id
      WHERE cm.loja_id = $1 AND cm.ativo = TRUE AND c.ativo = TRUE
      ORDER BY c.nome`,
    [lojaId]
  );
  return rows;
}

// Centros de custo ATIVOS de uma loja (para o seletor ao criar entrega).
async function centrosAtivosLoja({ empresaId, lojaId }) {
  const { rows } = await query(
    `SELECT id, nome, codigo FROM cliente_centros_custo WHERE loja_id = $1 AND ativo = TRUE ORDER BY nome`,
    [lojaId]
  );
  return rows;
}

// ── Checagem de permissão do cliente ──────────────────────────────
// Retorna TRUE se a loja tem a permissão (default permissivo se não houver
// linha de regras). Permissões válidas: pode_cancelar_associada,
// pode_alterar_profissional, pode_editar_servico, pode_escolher_profissional.
async function lojaPode(lojaId, permissao) {
  if (!lojaId) return true; // não é loja agindo → sem restrição aqui
  const colunasOk = ['pode_cancelar_associada', 'pode_alterar_profissional', 'pode_editar_servico', 'pode_escolher_profissional', 'somente_online'];
  if (!colunasOk.includes(permissao)) return true;
  const { rows } = await query(`SELECT ${permissao} AS v FROM cliente_regras_acionamento WHERE loja_id = $1`, [lojaId]);
  if (!rows[0]) return true; // sem config → permissivo (default)
  return rows[0].v !== false;
}

// ── Endereços de um centro de custo ───────────────────────────────
async function garantirCentro(empresaId, lojaId, centroId) {
  await exigirLoja(empresaId, lojaId);
  const { rows } = await query(`SELECT id, nome FROM cliente_centros_custo WHERE id = $1 AND loja_id = $2`, [centroId, lojaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Centro de custo não encontrado');
  return rows[0];
}

async function listarCentroEnderecos({ empresaId, lojaId, centroId }) {
  await garantirCentro(empresaId, lojaId, centroId);
  const { rows } = await query(
    `SELECT id, apelido, endereco, lat, lng, criado_em
       FROM cliente_centro_enderecos
      WHERE centro_id = $1 AND loja_id = $2
      ORDER BY criado_em`,
    [centroId, lojaId]
  );
  return rows;
}

async function adicionarCentroEndereco({ empresaId, lojaId, centroId, apelido, endereco, usuarioId, ip }) {
  await garantirCentro(empresaId, lojaId, centroId);
  if (!endereco || !endereco.trim()) throw AppError.validacao('Informe o endereço');

  // Geocodifica no cadastro. Se falhar, ainda salva (sem localização no mapa).
  let lat = null, lng = null;
  if (geocodificar) {
    try { const g = await geocodificar(endereco.trim()); lat = g.lat; lng = g.lng; } catch {}
  }

  const { rows } = await query(
    `INSERT INTO cliente_centro_enderecos (empresa_id, loja_id, centro_id, apelido, endereco, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, apelido, endereco, lat, lng, criado_em`,
    [empresaId, lojaId, centroId, apelido?.trim() || null, endereco.trim(), lat, lng]
  );
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'criar_endereco_centro', detalhe: { lojaId, centroId, id: rows[0].id }, ip }).catch(() => {});
  return rows[0];
}

async function removerCentroEndereco({ empresaId, lojaId, centroId, id, usuarioId, ip }) {
  await garantirCentro(empresaId, lojaId, centroId);
  const { rows } = await query(
    `DELETE FROM cliente_centro_enderecos WHERE id = $1 AND centro_id = $2 AND loja_id = $3 RETURNING id`,
    [id, centroId, lojaId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Endereço não encontrado');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'loja', acao: 'excluir_endereco_centro', detalhe: { lojaId, centroId, id }, ip }).catch(() => {});
  return { ok: true };
}

module.exports = {
  exigirLoja, alternarStatus,
  listarCentros, criarCentro, atualizarCentro, excluirCentro, criarUsuarioCentro,
  listarCentroEnderecos, adicionarCentroEndereco, removerCentroEndereco,
  listarUsuarios, listarUsuariosCentro, criarUsuario, atualizarUsuario, excluirUsuario,
  listarModalidades, categoriasDisponiveis, adicionarModalidade, atualizarModalidade, removerModalidade,
  obterRegras, salvarRegras,
  listarMotoboysExclusivos, atribuirMotoboy, removerMotoboy, motoboysDisponiveis,
  modalidadesAtivasLoja, centrosAtivosLoja, lojaPode,
};

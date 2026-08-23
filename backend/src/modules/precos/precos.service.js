const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');

const TIPOS = ['horario', 'volume_cliente', 'volume_motoboy', 'raio'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Ponto dentro de polígono (ray casting). pontos = [[lat,lng], ...].
function dentroDoPoligono(lat, lng, poligono) {
  if (!Array.isArray(poligono) || poligono.length < 3 || lat == null || lng == null) return false;
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const yi = poligono[i][0], xi = poligono[i][1];
    const yj = poligono[j][0], xj = poligono[j][1];
    const corta = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (corta) dentro = !dentro;
  }
  return dentro;
}

// Caixa envolvente (bounding box) de um polígono — usada no anti-choque de raio.
function bbox(poligono) {
  let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
  for (const [la, ln] of poligono) {
    if (la < latMin) latMin = la; if (la > latMax) latMax = la;
    if (ln < lngMin) lngMin = ln; if (ln > lngMax) lngMax = ln;
  }
  return { latMin, latMax, lngMin, lngMax };
}
function bboxSobrepoe(a, b) {
  return !(a.latMax < b.latMin || a.latMin > b.latMax || a.lngMax < b.lngMin || a.lngMin > b.lngMax);
}

// Escopos se sobrepõem quando, em cada dimensão, ao menos um é "qualquer" (null)
// ou os dois são iguais. Ex.: (loja X, null) sobrepõe (loja X, centro Y).
function escoposSobrepoe(a, b) {
  const dim = (x, y) => x == null || y == null || x === y;
  return dim(a.loja_id, b.loja_id) && dim(a.centro_id, b.centro_id) && dim(a.modalidade_id, b.modalidade_id);
}

function horariosSobrepoe(a, b) {
  // dias
  const da = a.dias_semana, db = b.dias_semana;
  const diasBatem = !da || !db || da.some((d) => db.includes(d));
  if (!diasBatem) return false;
  // faixa de horário (null = dia todo)
  const ini = (t) => (t ? t : '00:00:00');
  const fim = (t) => (t ? t : '23:59:59');
  const aI = ini(a.hora_inicio), aF = fim(a.hora_fim), bI = ini(b.hora_inicio), bF = fim(b.hora_fim);
  const horaBate = aI <= bF && bI <= aF;
  if (!horaBate) return false;
  // vigência por data (null = sempre)
  const dIni = (d) => (d ? new Date(d) : new Date('1900-01-01'));
  const dFim = (d) => (d ? new Date(d) : new Date('2999-12-31'));
  return dIni(a.data_inicio) <= dFim(b.data_fim) && dIni(b.data_inicio) <= dFim(a.data_fim);
}

// ---------------------------------------------------------------------------
// Anti-choque: uma regra nova não pode se sobrepor a outra ATIVA do mesmo tipo
// e escopo. Garante que, no lançamento, no máximo uma regra bate.
// ---------------------------------------------------------------------------
async function acharConflito({ empresaId, id = null, regra }) {
  const { rows } = await query(
    `SELECT * FROM precos_dinamicos WHERE empresa_id = $1 AND ativo = TRUE AND tipo = $2 AND id <> COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [empresaId, regra.tipo, id]
  );
  for (const outra of rows) {
    if (!escoposSobrepoe(regra, outra)) continue;
    if (regra.tipo === 'horario') {
      if (horariosSobrepoe(regra, outra)) return outra;
    } else if (regra.tipo === 'raio') {
      // Aproximação segura: se as caixas envolventes se cruzam, considera conflito.
      if (Array.isArray(regra.poligono) && Array.isArray(outra.poligono) &&
          bboxSobrepoe(bbox(regra.poligono), bbox(outra.poligono))) return outra;
    } else {
      // volume_cliente / volume_motoboy: mesmo escopo já é conflito.
      return outra;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
function normalizar(b) {
  return {
    nome: (b.nome || '').trim(),
    tipo: b.tipo,
    loja_id: b.loja_id || null,
    centro_id: b.centro_id || null,
    modalidade_id: b.modalidade_id || null,
    add_cliente_cent: Math.max(0, parseInt(b.add_cliente_cent, 10) || 0),
    add_motoboy_cent: Math.max(0, parseInt(b.add_motoboy_cent, 10) || 0),
    dias_semana: Array.isArray(b.dias_semana) && b.dias_semana.length ? b.dias_semana.map(Number) : null,
    hora_inicio: b.hora_inicio || null,
    hora_fim: b.hora_fim || null,
    data_inicio: b.data_inicio || null,
    data_fim: b.data_fim || null,
    volume_a_partir_de: b.volume_a_partir_de != null ? parseInt(b.volume_a_partir_de, 10) : null,
    volume_reset: b.volume_reset || null,
    poligono: Array.isArray(b.poligono) ? b.poligono : null,
  };
}

function validar(r) {
  if (!r.nome) throw AppError.validacao('Dê um nome à regra');
  if (!TIPOS.includes(r.tipo)) throw AppError.validacao('Tipo de gatilho inválido');
  if (!r.add_cliente_cent && !r.add_motoboy_cent) throw AppError.validacao('Informe ao menos um valor (cliente ou motoboy)');
  if (r.tipo === 'raio' && (!r.poligono || r.poligono.length < 3)) throw AppError.validacao('Desenhe a área no mapa (mínimo 3 pontos)');
  if ((r.tipo === 'volume_cliente' || r.tipo === 'volume_motoboy')) {
    if (!r.volume_a_partir_de || r.volume_a_partir_de < 1) throw AppError.validacao('Informe a partir de qual pedido/nota aplica');
    if (!['dia', 'semana', 'mes'].includes(r.volume_reset)) throw AppError.validacao('Escolha quando a contagem reinicia');
  }
}

async function listar(empresaId) {
  const { rows } = await query(`SELECT * FROM precos_dinamicos WHERE empresa_id = $1 ORDER BY ativo DESC, criado_em DESC`, [empresaId]);
  return rows;
}

async function criar({ empresaId, dados, usuarioId }) {
  const r = normalizar(dados);
  validar(r);
  const conflito = await acharConflito({ empresaId, regra: r });
  if (conflito) throw AppError.conflito(`Conflita com a regra ativa "${conflito.nome}". Ajuste o escopo, horário ou área para não sobrepor.`);
  const { rows } = await query(
    `INSERT INTO precos_dinamicos
      (empresa_id, nome, tipo, loja_id, centro_id, modalidade_id, add_cliente_cent, add_motoboy_cent,
       dias_semana, hora_inicio, hora_fim, data_inicio, data_fim, volume_a_partir_de, volume_reset, poligono, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [empresaId, r.nome, r.tipo, r.loja_id, r.centro_id, r.modalidade_id, r.add_cliente_cent, r.add_motoboy_cent,
     r.dias_semana, r.hora_inicio, r.hora_fim, r.data_inicio, r.data_fim, r.volume_a_partir_de, r.volume_reset,
     r.poligono ? JSON.stringify(r.poligono) : null, usuarioId || null]
  );
  return rows[0];
}

async function atualizar({ empresaId, id, dados }) {
  const r = normalizar(dados);
  validar(r);
  const conflito = await acharConflito({ empresaId, id, regra: r });
  if (conflito) throw AppError.conflito(`Conflita com a regra ativa "${conflito.nome}". Ajuste o escopo, horário ou área para não sobrepor.`);
  const { rows } = await query(
    `UPDATE precos_dinamicos SET nome=$3, tipo=$4, loja_id=$5, centro_id=$6, modalidade_id=$7,
       add_cliente_cent=$8, add_motoboy_cent=$9, dias_semana=$10, hora_inicio=$11, hora_fim=$12,
       data_inicio=$13, data_fim=$14, volume_a_partir_de=$15, volume_reset=$16, poligono=$17, atualizado_em=now()
     WHERE id=$1 AND empresa_id=$2 RETURNING *`,
    [id, empresaId, r.nome, r.tipo, r.loja_id, r.centro_id, r.modalidade_id, r.add_cliente_cent, r.add_motoboy_cent,
     r.dias_semana, r.hora_inicio, r.hora_fim, r.data_inicio, r.data_fim, r.volume_a_partir_de, r.volume_reset,
     r.poligono ? JSON.stringify(r.poligono) : null]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Regra não encontrada');
  return rows[0];
}

async function alternar({ empresaId, id, ativo }) {
  // Ao reativar, revalida conflito (não pode reativar sobre outra ativa).
  if (ativo) {
    const { rows } = await query(`SELECT * FROM precos_dinamicos WHERE id=$1 AND empresa_id=$2`, [id, empresaId]);
    if (!rows[0]) throw AppError.naoEncontrado('Regra não encontrada');
    const conflito = await acharConflito({ empresaId, id, regra: rows[0] });
    if (conflito) throw AppError.conflito(`Não dá para ativar: conflita com "${conflito.nome}".`);
  }
  const { rows } = await query(`UPDATE precos_dinamicos SET ativo=$3, atualizado_em=now() WHERE id=$1 AND empresa_id=$2 RETURNING *`, [id, empresaId, !!ativo]);
  if (!rows[0]) throw AppError.naoEncontrado('Regra não encontrada');
  return rows[0];
}

async function remover({ empresaId, id }) {
  await query(`DELETE FROM precos_dinamicos WHERE id=$1 AND empresa_id=$2`, [id, empresaId]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contadores de volume (para gatilhos volume_cliente / volume_motoboy).
// ---------------------------------------------------------------------------
function inicioJanela(reset, agora) {
  const d = new Date(agora);
  if (reset === 'dia') return `date_trunc('day', now() AT TIME ZONE 'America/Bahia')`;
  if (reset === 'semana') return `date_trunc('week', now() AT TIME ZONE 'America/Bahia')`;
  return `date_trunc('month', now() AT TIME ZONE 'America/Bahia')`;
}

async function contarEntregasLoja(empresaId, lojaId, reset) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM entregas
      WHERE empresa_id=$1 AND loja_id=$2
        AND (criado_em AT TIME ZONE 'America/Bahia') >= ${inicioJanela(reset)}`,
    [empresaId, lojaId]
  );
  return rows[0] ? rows[0].n : 0;
}
async function contarEntregasMotoboy(empresaId, motoboyId, reset) {
  if (!motoboyId) return 0;
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM entregas
      WHERE empresa_id=$1 AND motoboy_id=$2
        AND (criado_em AT TIME ZONE 'America/Bahia') >= ${inicioJanela(reset)}`,
    [empresaId, motoboyId]
  );
  return rows[0] ? rows[0].n : 0;
}

// ---------------------------------------------------------------------------
// MOTOR — calcula o ajuste dinâmico no lançamento. Como o anti-choque garante
// não-sobreposição, no máximo uma regra bate. Retorna null se nenhuma.
// ---------------------------------------------------------------------------
async function calcularDinamica({ empresaId, lojaId = null, centroId = null, modalidadeId = null, coletaLat = null, coletaLng = null, motoboyId = null, quando = new Date() }) {
  const { rows: regras } = await query(
    `SELECT * FROM precos_dinamicos
      WHERE empresa_id=$1 AND ativo=TRUE
        AND (loja_id IS NULL OR loja_id=$2)
        AND (centro_id IS NULL OR centro_id=$3)
        AND (modalidade_id IS NULL OR modalidade_id=$4)`,
    [empresaId, lojaId, centroId, modalidadeId]
  );
  const agora = new Date(quando);
  // Data/hora no fuso da Bahia para o gatilho de horário.
  const bahia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Bahia' }));
  const dow = bahia.getDay();
  const hhmm = bahia.toTimeString().slice(0, 8);
  const hoje = bahia.toISOString().slice(0, 10);

  for (const r of regras) {
    let bate = false;
    if (r.tipo === 'horario') {
      const diaOk = !r.dias_semana || r.dias_semana.includes(dow);
      const horaOk = (!r.hora_inicio || hhmm >= r.hora_inicio) && (!r.hora_fim || hhmm <= r.hora_fim);
      const dataOk = (!r.data_inicio || hoje >= String(r.data_inicio).slice(0, 10)) && (!r.data_fim || hoje <= String(r.data_fim).slice(0, 10));
      bate = diaOk && horaOk && dataOk;
    } else if (r.tipo === 'raio') {
      bate = dentroDoPoligono(coletaLat, coletaLng, r.poligono);
    } else if (r.tipo === 'volume_cliente') {
      if (lojaId) {
        const n = await contarEntregasLoja(empresaId, lojaId, r.volume_reset);
        bate = (n + 1) >= r.volume_a_partir_de; // a entrega sendo criada é a (n+1)
      }
    } else if (r.tipo === 'volume_motoboy') {
      if (motoboyId) {
        const n = await contarEntregasMotoboy(empresaId, motoboyId, r.volume_reset);
        bate = (n + 1) >= r.volume_a_partir_de;
      }
    }
    if (bate) {
      return {
        regra_id: r.id, regra_nome: r.nome, tipo: r.tipo,
        add_cliente_cent: r.add_cliente_cent, add_motoboy_cent: r.add_motoboy_cent,
      };
    }
  }
  return null;
}

module.exports = {
  listar, criar, atualizar, alternar, remover, calcularDinamica, acharConflito,
};

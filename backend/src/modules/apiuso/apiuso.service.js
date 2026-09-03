const { query } = require('../../shared/db');
const { getEmpresa } = require('../../shared/contexto');

const SEM = '00000000-0000-0000-0000-000000000000';

// Registra 1 evento de uso. Pega o empresa_id do contexto se não vier explícito.
// Fire-and-forget: NUNCA pode quebrar a operação — engole qualquer erro.
async function registrar({ provedor, operacao, cache = false, empresaId }) {
  try {
    const emp = empresaId || getEmpresa() || SEM;
    await query(
      `INSERT INTO api_uso (provedor, operacao, empresa_id, dia, chamadas, cache)
       VALUES ($1, $2, $3::uuid, CURRENT_DATE, $4, $5)
       ON CONFLICT (provedor, operacao, empresa_id, dia)
       DO UPDATE SET chamadas = api_uso.chamadas + EXCLUDED.chamadas,
                     cache    = api_uso.cache    + EXCLUDED.cache`,
      [provedor, operacao, emp, cache ? 0 : 1, cache ? 1 : 0]
    );
  } catch (_) { /* silencioso de propósito */ }
}

// Atalho não-bloqueante para os call sites (não usa await).
function contar(provedor, operacao, cache = false) {
  registrar({ provedor, operacao, cache }).catch(() => {});
}

function intervalo(preset, de, ate) {
  if (de && ate) return { de, ate };
  const hoje = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const ini = new Date(hoje);
  if (preset === 'hoje') { /* mesmo dia */ }
  else if (preset === '30dias') ini.setDate(ini.getDate() - 29);
  else if (preset === 'mes') { ini.setDate(1); }
  else ini.setDate(ini.getDate() - 6); // 7dias (default)
  return { de: fmt(ini), ate: fmt(hoje) };
}

async function precos() {
  const { rows } = await query(`SELECT provedor, operacao, preco_por_mil, franquia_gratis, moeda FROM api_uso_preco ORDER BY provedor, operacao`);
  return rows;
}

async function definirPrecos(lista) {
  if (!Array.isArray(lista)) return { atualizados: 0 };
  let n = 0;
  for (const p of lista) {
    if (!p || !p.provedor || !p.operacao) continue;
    const valor = Number(p.preco_por_mil);
    if (Number.isNaN(valor) || valor < 0) continue;
    const franquia = Math.max(0, Math.round(Number(p.franquia_gratis) || 0));
    await query(
      `INSERT INTO api_uso_preco (provedor, operacao, preco_por_mil, franquia_gratis)
       VALUES ($1,$2,$3,$4) ON CONFLICT (provedor, operacao)
       DO UPDATE SET preco_por_mil = EXCLUDED.preco_por_mil, franquia_gratis = EXCLUDED.franquia_gratis`,
      [p.provedor, p.operacao, valor, franquia]
    );
    n++;
  }
  return { atualizados: n };
}

async function resumo({ preset, de, ate } = {}) {
  const per = intervalo(preset, de, ate);

  const porOperacao = (await query(
    `SELECT provedor, operacao, SUM(chamadas)::bigint AS chamadas, SUM(cache)::bigint AS cache
       FROM api_uso WHERE dia BETWEEN $1 AND $2
      GROUP BY provedor, operacao ORDER BY provedor, operacao`,
    [per.de, per.ate]
  )).rows;

  const porCliente = (await query(
    `SELECT u.empresa_id,
            COALESCE(e.razao_social, e.nome_fantasia,
                     CASE WHEN u.empresa_id = $3 THEN 'Sistema / sem cliente' ELSE '—' END) AS nome,
            u.provedor, u.operacao,
            SUM(u.chamadas)::bigint AS chamadas, SUM(u.cache)::bigint AS cache
       FROM api_uso u
       LEFT JOIN empresas e ON e.id = u.empresa_id
      WHERE u.dia BETWEEN $1 AND $2
      GROUP BY u.empresa_id, e.razao_social, e.nome_fantasia, u.provedor, u.operacao`,
    [per.de, per.ate, SEM]
  )).rows;

  // Uso do MÊS corrente por operação — base do custo (a fatura é mensal e a
  // franquia grátis é por mês). Independe do período selecionado na tela.
  const mesAtual = (await query(
    `SELECT provedor, operacao, SUM(chamadas)::bigint AS chamadas, SUM(cache)::bigint AS cache
       FROM api_uso WHERE dia >= date_trunc('month', CURRENT_DATE)::date
      GROUP BY provedor, operacao`
  )).rows;

  return { periodo: per, precos: await precos(), porOperacao, porCliente, mesAtual };
}

module.exports = { registrar, contar, resumo, precos, definirPrecos };

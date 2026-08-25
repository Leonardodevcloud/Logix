// Módulo de Relatórios — consulta a operação (entregas) com filtros e gera
// exportação para Excel (XML do Excel, sem dependência) e CSV.
const { query } = require('../../shared/db');

const TZ = 'America/Bahia';

function fmtDT(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('pt-BR', {
      timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return ''; }
}
function money(n) { return n == null ? '' : Number(n).toFixed(2).replace('.', ','); }

// SLA: de criado_em até concluida_em, prazo por faixa de km (global + override por loja).
function calcularSla(r, cfg) {
  if (!cfg) return null;
  const km = r.distancia_km != null ? Number(r.distancia_km) : null;
  let minutos = cfg.sla_padrao_min || 90;
  if (km != null && Array.isArray(cfg.faixas) && cfg.faixas.length) {
    const f = [...cfg.faixas].sort((a, b) => a.ate_km - b.ate_km).find((x) => km <= x.ate_km);
    if (f && f.minutos) minutos = f.minutos;
  }
  const criado = new Date(r.criado_em).getTime();
  const fim = r.concluida_em ? new Date(r.concluida_em).getTime() : Date.now();
  return fim <= criado + minutos * 60000 ? 'no_prazo' : 'fora_prazo';
}
async function slaCfg(empresaId) {
  const { rows } = await query(`SELECT * FROM sla_config WHERE empresa_id=$1 AND ativo=TRUE`, [empresaId]);
  return {
    geral: rows.find((c) => c.loja_id == null) || null,
    porLoja: new Map(rows.filter((c) => c.loja_id != null).map((c) => [c.loja_id, c])),
  };
}
function colData(base) { return base === 'finalizacao' ? 'concluida_em' : base === 'coleta' ? 'chegada_coleta_em' : 'criado_em'; }

function montarWhere(f) {
  const cond = ['e.empresa_id = $1'];
  const params = [f.empresaId];
  const push = (v) => { params.push(v); return '$' + params.length; };
  if (f.lojaId) cond.push('e.loja_id = ' + push(f.lojaId));
  if (f.centroId) cond.push('e.centro_custo_id = ' + push(f.centroId));
  if (f.motoboyId) cond.push('e.motoboy_id = ' + push(f.motoboyId));
  if (f.motoboyBusca) cond.push('e.motoboy_id IN (SELECT id FROM motoboys WHERE empresa_id = e.empresa_id AND (nome_completo ILIKE ' + push('%' + f.motoboyBusca + '%') + ' OR codigo::text = ' + push(f.motoboyBusca) + '))');
  if (f.status === 'entregue') cond.push("e.status='entregue'");
  else if (f.status === 'cancelada') cond.push("e.status='cancelada'");
  if (f.categoriaId) cond.push('e.modalidade_id IN (SELECT cm2.id FROM cliente_modalidades cm2 WHERE cm2.categoria_id = ' + push(f.categoriaId) + ')');
  if (f.dinamica === 'com') cond.push('e.preco_dinamico_id IS NOT NULL');
  else if (f.dinamica === 'sem') cond.push('e.preco_dinamico_id IS NULL');
  else if (f.dinamica) cond.push('e.preco_dinamico_id = ' + push(f.dinamica));
  const col = colData(f.baseData);
  if (f.de) cond.push(`(e.${col} AT TIME ZONE '${TZ}')::date >= ` + push(f.de));
  if (f.ate) cond.push(`(e.${col} AT TIME ZONE '${TZ}')::date <= ` + push(f.ate));
  return { where: cond.join(' AND '), params };
}

async function gerarRelatorio(f) {
  const { where, params } = montarWhere(f);
  const ordem = f.ordenar === 'protocolo' ? 'e.protocolo' : f.ordenar === 'loja' ? 'l.nome_fantasia' : 'e.criado_em DESC';
  const lim = f.todos ? '' : `LIMIT ${Math.min(2000, +f.limite || 100)} OFFSET ${+f.offset || 0}`;
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.status, e.criado_em, e.iniciada_em, e.concluida_em, e.cancelada_em,
            e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng, e.chegada_coleta_em,
            e.distancia_km, e.valor_cliente_cent, e.valor_motoboy_cent, e.loja_id, e.origem, e.referencia_externa,
            e.preco_dinamico_id, e.dinamica_add_cliente_cent, e.dinamica_add_motoboy_cent, pd.nome AS dinamica_nome,
            m.codigo AS mb_codigo, m.nome_completo AS mb_nome, l.nome_fantasia AS loja_nome, fc.nome AS categoria_nome,
            (SELECT json_agg(json_build_object(
               'ordem',ep.ordem,'endereco',ep.endereco,'lat',ep.lat,'lng',ep.lng,'nome_fantasia',ep.nome_fantasia,
               'numero_nf',ep.numero_nf,'chegou_em',ep.chegou_em,'entregue_em',ep.entregue_em,
               'finalizado_em',ep.finalizado_em,'recebedor',ep.recebedor,'status',ep.status) ORDER BY ep.ordem)
             FROM entregas_pontos ep WHERE ep.entrega_id=e.id) AS pontos
       FROM entregas e
       LEFT JOIN motoboys m ON m.id=e.motoboy_id
       LEFT JOIN lojas l ON l.id=e.loja_id
       LEFT JOIN cliente_modalidades cm ON cm.id=e.modalidade_id
       LEFT JOIN frete_categorias fc ON fc.id=cm.categoria_id
       LEFT JOIN precos_dinamicos pd ON pd.id=e.preco_dinamico_id
      WHERE ${where} ORDER BY ${ordem} ${lim}`,
    params
  );
  const { geral, porLoja } = await slaCfg(f.empresaId);
  let linhas = rows.map((r) => ({
    ...r,
    pontos: r.pontos || [],
    sla: r.status === 'entregue' ? calcularSla(r, porLoja.get(r.loja_id) || geral) : null,
    valor_cliente: r.valor_cliente_cent != null ? r.valor_cliente_cent / 100 : null,
    valor_motoboy: r.valor_motoboy_cent != null ? r.valor_motoboy_cent / 100 : null,
    dinamica_nome: r.dinamica_nome || null,
    dinamica_add_cliente: r.dinamica_add_cliente_cent ? r.dinamica_add_cliente_cent / 100 : 0,
    dinamica_add_motoboy: r.dinamica_add_motoboy_cent ? r.dinamica_add_motoboy_cent / 100 : 0,
  }));
  if (f.sla === 'no_prazo') linhas = linhas.filter((l) => l.sla === 'no_prazo');
  else if (f.sla === 'fora_prazo') linhas = linhas.filter((l) => l.sla === 'fora_prazo');
  return linhas;
}

async function resumoRelatorio(f) {
  const { where, params } = montarWhere(f);
  const { rows } = await query(
    `SELECT count(*)::int AS servicos,
            count(*) FILTER (WHERE e.status='entregue')::int AS concluidos,
            count(*) FILTER (WHERE e.status='cancelada')::int AS cancelados,
            COALESCE(sum(e.distancia_km) FILTER (WHERE e.distancia_km IS NOT NULL AND e.distancia_km<>'NaN'::numeric),0) AS km,
            COALESCE(sum(e.valor_cliente_cent),0)::bigint AS vcli,
            COALESCE(sum(e.valor_motoboy_cent),0)::bigint AS vmot
       FROM entregas e LEFT JOIN lojas l ON l.id=e.loja_id WHERE ${where}`,
    params
  );
  const a = rows[0] || {};
  const { rows: conc } = await query(
    `SELECT e.loja_id, e.criado_em, e.concluida_em, e.distancia_km
       FROM entregas e LEFT JOIN lojas l ON l.id=e.loja_id WHERE ${where} AND e.status='entregue'`,
    params
  );
  const { geral, porLoja } = await slaCfg(f.empresaId);
  let noPrazo = 0, fora = 0;
  for (const r of conc) { const s = calcularSla(r, porLoja.get(r.loja_id) || geral); if (s === 'fora_prazo') fora++; else if (s === 'no_prazo') noPrazo++; }
  return {
    servicos: a.servicos || 0, concluidos: a.concluidos || 0, cancelados: a.cancelados || 0,
    km: Math.round((Number(a.km) || 0) * 10) / 10, no_prazo: noPrazo, fora_prazo: fora,
    valor_cliente: Number(a.vcli || 0) / 100, valor_motoboy: Number(a.vmot || 0) / 100,
  };
}

async function opcoes({ empresaId, ehAdmin }) {
  const cats = await query(`SELECT id, nome FROM frete_categorias WHERE empresa_id=$1 AND ativo=TRUE ORDER BY nome`, [empresaId]);
  const din = await query(`SELECT id, nome FROM precos_dinamicos WHERE empresa_id=$1 ORDER BY nome`, [empresaId]);
  const out = { categorias: cats.rows, dinamicas: din.rows };
  if (ehAdmin) {
    const lj = await query(`SELECT id, nome_fantasia AS nome FROM lojas WHERE empresa_id=$1 ORDER BY nome_fantasia`, [empresaId]);
    out.lojas = lj.rows;
  }
  return out;
}

// ---------- Exportação (linhas achatadas: 1 linha por serviço) ----------
const rotuloStatus = (s) => s === 'entregue' ? 'Concluído' : s === 'cancelada' ? 'Cancelado' : (s || '');
const rotuloSla = (s) => s === 'no_prazo' ? 'No prazo' : s === 'fora_prazo' ? 'Fora do prazo' : '';

function nomeProf(l) { return (l.mb_codigo != null ? l.mb_codigo + ' - ' : '') + (l.mb_nome || ''); }
function achatar(linhas, verMotoboy, comEnderecos, exibirValores, comProfissional) {
  const verMb = verMotoboy && comProfissional !== false;
  const mostrarCli = exibirValores === 'ambos' || exibirValores === 'cliente';
  const mostrarProf = verMb && (exibirValores === 'ambos' || exibirValores === 'motoboy');
  const headers = ['Serviço', 'Cliente', 'Status', 'SLA', 'Criação', 'Tela motoboy'];
  if (comEnderecos) headers.push('Coleta (endereço)');
  headers.push('Chegada coleta');
  if (comEnderecos) headers.push('Entregas (endereço | NF | recebedor | entrega)');
  else headers.push('Entregas (NF | recebedor | entrega)');
  headers.push('Distância (km)');
  if (verMb) headers.push('Profissional');
  headers.push('Modal', 'Dinâmica');
  if (mostrarCli) headers.push('Valor cliente');
  if (mostrarProf) headers.push('Valor motoboy');
  headers.push('Finalização');

  const rows = linhas.map((l) => {
    const ents = (l.pontos || []).map((p) => {
      const partes = [];
      if (comEnderecos) partes.push(p.endereco || '');
      if (p.numero_nf) partes.push('NF ' + p.numero_nf);
      if (p.recebedor) partes.push(p.recebedor);
      if (p.entregue_em || p.finalizado_em) partes.push(fmtDT(p.entregue_em || p.finalizado_em));
      return partes.join(' | ');
    }).join('  ||  ');
    const r = [l.protocolo, l.loja_nome || '', rotuloStatus(l.status), rotuloSla(l.sla), fmtDT(l.criado_em), fmtDT(l.iniciada_em)];
    if (comEnderecos) r.push(l.coleta_endereco || '');
    r.push(fmtDT(l.chegada_coleta_em));
    r.push(ents);
    r.push(l.distancia_km != null ? Number(l.distancia_km) : '');
    if (verMb) r.push(nomeProf(l));
    r.push(l.categoria_nome || '', l.dinamica_nome || '');
    if (mostrarCli) r.push(l.valor_cliente != null ? Number(l.valor_cliente) : '');
    if (mostrarProf) r.push(l.valor_motoboy != null ? Number(l.valor_motoboy) : '');
    r.push(fmtDT(l.concluida_em));
    return r;
  });
  return { headers, rows };
}

function csvEscape(v) { const s = String(v == null ? '' : v); return '"' + s.replace(/"/g, '""') + '"'; }
function buildCsv(headers, rows) {
  const linhas = [headers.map(csvEscape).join(';')];
  for (const r of rows) linhas.push(r.map((v) => typeof v === 'number' ? csvEscape(String(v).replace('.', ',')) : csvEscape(v)).join(';'));
  return '\ufeff' + linhas.join('\r\n'); // BOM p/ acentos no Excel
}

function xmlEscape(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function buildXls(headers, rows) {
  const cabecalho = headers.map((h) => `<Cell ss:StyleID="h"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join('');
  const corpo = rows.map((r) => '<Row>' + r.map((v) => {
    if (typeof v === 'number' && Number.isFinite(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
  }).join('') + '</Row>').join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#042C53" ss:Pattern="Solid"/></Style></Styles>
 <Worksheet ss:Name="Relatorio"><Table><Row>${cabecalho}</Row>${corpo}</Table></Worksheet>
</Workbook>`;
}

function exportar(linhas, { verMotoboy, comEnderecos, formato, exibirValores, comProfissional }) {
  const { headers, rows } = achatar(linhas, verMotoboy, comEnderecos !== false, exibirValores || 'ambos', comProfissional !== false);
  const data = new Date().toISOString().slice(0, 10);
  if (formato === 'csv') return { conteudo: buildCsv(headers, rows), mime: 'text/csv; charset=utf-8', nome: `relatorio-logix-${data}.csv` };
  return { conteudo: buildXls(headers, rows), mime: 'application/vnd.ms-excel; charset=utf-8', nome: `relatorio-logix-${data}.xls` };
}

module.exports = { gerarRelatorio, resumoRelatorio, opcoes, exportar };

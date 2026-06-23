import { casca } from '../core/layout.js';
import { el, icones, statusBadge } from '../core/ui.js';
import { get } from '../core/api.js';
import * as auth from '../core/auth.js';

function kpi(icone, valor, rotulo) {
  return el('div', { class: 'lx-card lx-kpi' },
    el('div', { class: 'k-top' }, el('span', { class: 'k-ico', html: icones[icone] || '' })),
    el('div', { class: 'k-val' }, String(valor)),
    el('div', { class: 'k-lbl' }, rotulo));
}

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export async function montar(container) {
  const grade = el('div', { class: 'lx-grid-kpi' });
  const secTitulo = el('h2', {}, 'Carregando…');
  const corpoSec = el('div', { class: 'lx-card lx-card-pad' }, '');
  const sec = el('div', { class: 'lx-sec-h' }, secTitulo, el('span', { class: 'lx-speed' }, el('i'), el('i'), el('i')));

  container.append(casca('Painel', el('div', {}, grade, sec, corpoSec)));

  try {
    if (auth.acessoAtual().perfil === 'super_admin') {
      const empresas = await get('/empresas').catch(() => []);
      const frota = empresas.reduce((s, e) => s + (e.total_motoboys || 0), 0);
      grade.append(
        kpi('clientes', empresas.length, 'Clientes'),
        kpi('motoboys', frota, 'Motoboys na rede'));
      secTitulo.textContent = 'Clientes recentes';
      tabelaClientes(corpoSec, empresas.slice(0, 6));
    } else {
      const entregas = auth.temModulo('entregas') ? await get('/entregas').catch(() => []) : [];
      const motoboys = auth.temModulo('motoboys') ? await get('/motoboys').catch(() => []) : [];
      const naFila = entregas.filter((e) => e.status === 'aguardando_atribuicao').length;
      const emRota = entregas.filter((e) => ['aguardando_coleta', 'em_coleta', 'em_rota'].includes(e.status)).length;
      const online = motoboys.filter((m) => m.online).length;
      grade.append(
        kpi('entregas', entregas.length, 'Entregas'),
        kpi('filas', naFila, 'Na fila'),
        kpi('entregas', emRota, 'Em andamento'),
        kpi('motoboys', online, 'Motoboys online'));
      secTitulo.textContent = 'Últimas entregas';
      tabelaEntregas(corpoSec, entregas.slice(0, 6), fmtData);
    }
  } catch { corpoSec.textContent = ''; corpoSec.append(el('div', { class: 'lx-muted' }, 'Não foi possível carregar os indicadores agora.')); }
}

function tabelaEntregas(container, linhas, fmtData) {
  container.innerHTML = '';
  if (!linhas.length) { container.append(el('div', { class: 'lx-muted' }, 'Nenhuma entrega lançada ainda.')); return; }
  const tbody = el('tbody');
  linhas.forEach((e) => tbody.append(el('tr', {},
    el('td', {}, el('b', {}, e.protocolo || '—')),
    el('td', {}, statusBadge(e.status)),
    el('td', { class: 'lx-muted' }, fmtData(e.criado_em)))));
  container.append(el('table', { class: 'lx-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Protocolo'), el('th', {}, 'Status'), el('th', {}, 'Criada'))), tbody));
}

function tabelaClientes(container, linhas) {
  container.innerHTML = '';
  if (!linhas.length) { container.append(el('div', { class: 'lx-muted' }, 'Nenhum cliente cadastrado ainda.')); return; }
  const tbody = el('tbody');
  linhas.forEach((c) => tbody.append(el('tr', {},
    el('td', {}, el('b', {}, c.razao_social || c.nome_fantasia || '—')),
    el('td', { class: 'lx-muted' }, (c.total_motoboys ?? 0) + ' motoboys'))));
  container.append(el('table', { class: 'lx-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Cliente'), el('th', {}, 'Frota'))), tbody));
}

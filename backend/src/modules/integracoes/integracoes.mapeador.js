// Conversões entre o formato do sistema de integração legado e o modelo do Logix.
// Mantém o contrato ESPELHADO: os sistemas do cliente enviam/recebem exatamente
// como já fazem hoje, só mudando a URL e as credenciais.

function s(v) { return (v == null ? '' : String(v)).trim(); }

// Verdadeiro para "S"/"true"/"1"/"sim" (case-insensitive).
function ehSim(v) {
  const t = s(v).toLowerCase();
  return t === 's' || t === 'true' || t === '1' || t === 'sim';
}

// Número tolerante (aceita "-19,93" ou "-19.93" ou " -44.16 "); null se vazio/ inválido.
function num(v) {
  if (v == null || s(v) === '') return null;
  const n = Number(s(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Monta o endereço em texto a partir das partes de um ponto do contrato externo.
function montarEndereco(p) {
  const linha1 = [s(p.rua), s(p.numero)].filter(Boolean).join(', ');
  const partes = [
    linha1,
    s(p.bairro),
    [s(p.cidade), s(p.uf)].filter(Boolean).join(' - '),
    s(p.cep),
  ].filter(Boolean);
  return partes.join(', ');
}

// Converte um ponto do contrato externo -> ponto Logix (coleta ou destino).
function pontoParaLogix(p) {
  const lat = num(p.la);
  const lng = num(p.lo);
  const obsPartes = [s(p.obs), s(p.complemento) ? `Compl.: ${s(p.complemento)}` : ''].filter(Boolean);
  return {
    nome: s(p.procurarPor) || s(p.nome_fantasia) || null,
    nome_fantasia: s(p.procurarPor) || null,
    endereco: montarEndereco(p),
    lat: lat != null ? lat : undefined,
    lng: lng != null ? lng : undefined,
    telefone: s(p.telefone) || null,
    observacoes: obsPartes.join(' — ') || null,
    numero_nf: s(p.numeroNota) || null,
    complemento: s(p.complemento) || null,
  };
}

// Formata minutos -> "HH:MM:SS" (duração no estilo do contrato externo).
function formatarDuracao(min) {
  if (min == null || !Number.isFinite(Number(min))) return '';
  const totalSeg = Math.round(Number(min) * 60);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const sec = totalSeg % 60;
  const zz = (x) => String(x).padStart(2, '0');
  return `${zz(h)}:${zz(m)}:${zz(sec)}`;
}

// Centavos -> "139.30" (string com 2 casas, ponto decimal).
function centavosParaValor(cent) {
  if (cent == null) return '';
  return (Number(cent) / 100).toFixed(2);
}

// status interno do Logix -> sigla de status do contrato externo.
//   SP: sem profissional · A: em execução · F: finalizado · C: cancelado
function statusParaSigla(status, motoboyId) {
  if (status === 'entregue') return 'F';
  if (status === 'cancelada') return 'C';
  if (status === 'aguardando_atribuicao') return 'SP';
  if (['aguardando_coleta', 'em_coleta', 'em_rota'].includes(status)) {
    return motoboyId ? 'A' : 'SP';
  }
  return 'SP';
}

module.exports = {
  s, ehSim, num, montarEndereco, pontoParaLogix,
  formatarDuracao, centavosParaValor, statusParaSigla,
};

// Tema padrão IG — fallback quando o tenant não tem branding ou o host não resolve.
const TEMA_PADRAO = {
  nome_exibicao: 'Logix',
  logo_url: null,
  logo_escuro_url: null,
  icone_app_url: null,
  favicon_url: null,
  cor_primaria: '#185FA5',
  cor_secundaria: '#042C53',
  cor_destaque: '#378ADD',
  cor_clara: '#B5D4F4',
  mostrar_powered_by: true,
};

const RE_HEX = /^#([0-9a-fA-F]{6})$/;
function ehCorHex(v) { return typeof v === 'string' && RE_HEX.test(v); }

// Extrai o slug de subdomínio (ex.: 'autoforte.logix.com.br' -> 'autoforte').
// Ignora os hosts reservados da própria IG.
function extrairSubdominio(host, baseDominio = process.env.DOMINIO_BASE || 'logix.com.br') {
  if (!host) return null;
  const limpo = host.split(':')[0].toLowerCase();
  const sufixo = '.' + baseDominio;
  if (!limpo.endsWith(sufixo)) return null;
  const slug = limpo.slice(0, -sufixo.length);
  const reservados = ['www', 'app', 'portal', 'admin', 'api'];
  if (!slug || slug.includes('.') || reservados.includes(slug)) return null;
  return slug;
}

module.exports = { TEMA_PADRAO, ehCorHex, extrairSubdominio };

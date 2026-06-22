const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { TEMA_PADRAO, ehCorHex, extrairSubdominio } = require('./branding.shared');

// Resolve o empresa_id a partir do host (domínio próprio ou subdomínio).
async function resolverEmpresaPorHost(host) {
  if (!host) return null;
  const limpo = host.split(':')[0].toLowerCase();
  let r = await query(`SELECT empresa_id FROM empresa_branding WHERE dominio = $1`, [limpo]);
  if (r.rows[0]) return r.rows[0].empresa_id;
  const slug = extrairSubdominio(limpo);
  if (slug) {
    r = await query(`SELECT empresa_id FROM empresa_branding WHERE subdominio = $1`, [slug]);
    if (r.rows[0]) return r.rows[0].empresa_id;
  }
  return null;
}

// Branding público (cores, logo, nome). Nunca lança: cai no tema padrão IG.
async function obterPublico({ empresaId = null, host = null }) {
  let id = empresaId;
  if (!id && host) id = await resolverEmpresaPorHost(host);
  if (!id) return { ...TEMA_PADRAO, empresa_id: null };
  const { rows } = await query(
    `SELECT b.*, e.nome_fantasia, e.razao_social
       FROM empresa_branding b JOIN empresas e ON e.id = b.empresa_id
      WHERE b.empresa_id = $1`,
    [id]
  );
  if (!rows[0]) return { ...TEMA_PADRAO, empresa_id: id };
  const b = rows[0];
  return {
    empresa_id: b.empresa_id,
    nome_exibicao: b.nome_exibicao || b.nome_fantasia || b.razao_social || TEMA_PADRAO.nome_exibicao,
    logo_url: b.logo_url,
    logo_escuro_url: b.logo_escuro_url,
    icone_app_url: b.icone_app_url,
    favicon_url: b.favicon_url,
    cor_primaria: b.cor_primaria || TEMA_PADRAO.cor_primaria,
    cor_secundaria: b.cor_secundaria || TEMA_PADRAO.cor_secundaria,
    cor_destaque: b.cor_destaque || TEMA_PADRAO.cor_destaque,
    cor_clara: b.cor_clara || TEMA_PADRAO.cor_clara,
    mostrar_powered_by: b.mostrar_powered_by,
    extra: b.extra || null,
  };
}

// Branding completo (inclui domínio/remetente) — uso na tela de configuração.
async function obterCompleto(empresaId) {
  const { rows } = await query(`SELECT * FROM empresa_branding WHERE empresa_id = $1`, [empresaId]);
  return rows[0] || null;
}

// Cria/atualiza (upsert) o branding de uma empresa.
async function definir({ empresaId, dados, usuarioId, ip }) {
  for (const campo of ['cor_primaria', 'cor_secundaria', 'cor_destaque', 'cor_clara']) {
    if (dados[campo] != null && !ehCorHex(dados[campo])) {
      throw AppError.validacao(`Cor inválida em ${campo} (use o formato #RRGGBB)`);
    }
  }
  try {
    const { rows } = await query(
      `INSERT INTO empresa_branding (empresa_id, nome_exibicao, logo_url, logo_escuro_url, icone_app_url,
         favicon_url, cor_primaria, cor_secundaria, cor_destaque, cor_clara,
         dominio, subdominio, remetente_nome, remetente_email, mostrar_powered_by, extra, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
       ON CONFLICT (empresa_id) DO UPDATE SET
         nome_exibicao      = COALESCE(EXCLUDED.nome_exibicao, empresa_branding.nome_exibicao),
         logo_url           = COALESCE(EXCLUDED.logo_url, empresa_branding.logo_url),
         logo_escuro_url    = COALESCE(EXCLUDED.logo_escuro_url, empresa_branding.logo_escuro_url),
         icone_app_url      = COALESCE(EXCLUDED.icone_app_url, empresa_branding.icone_app_url),
         favicon_url        = COALESCE(EXCLUDED.favicon_url, empresa_branding.favicon_url),
         cor_primaria       = COALESCE(EXCLUDED.cor_primaria, empresa_branding.cor_primaria),
         cor_secundaria     = COALESCE(EXCLUDED.cor_secundaria, empresa_branding.cor_secundaria),
         cor_destaque       = COALESCE(EXCLUDED.cor_destaque, empresa_branding.cor_destaque),
         cor_clara          = COALESCE(EXCLUDED.cor_clara, empresa_branding.cor_clara),
         dominio            = COALESCE(EXCLUDED.dominio, empresa_branding.dominio),
         subdominio         = COALESCE(EXCLUDED.subdominio, empresa_branding.subdominio),
         remetente_nome     = COALESCE(EXCLUDED.remetente_nome, empresa_branding.remetente_nome),
         remetente_email    = COALESCE(EXCLUDED.remetente_email, empresa_branding.remetente_email),
         mostrar_powered_by = COALESCE(EXCLUDED.mostrar_powered_by, empresa_branding.mostrar_powered_by),
         extra              = COALESCE(EXCLUDED.extra, empresa_branding.extra),
         atualizado_em      = now()
       RETURNING *`,
      [empresaId, dados.nome_exibicao || null, dados.logo_url || null, dados.logo_escuro_url || null,
       dados.icone_app_url || null, dados.favicon_url || null, dados.cor_primaria || null,
       dados.cor_secundaria || null, dados.cor_destaque || null, dados.cor_clara || null,
       dados.dominio ? dados.dominio.toLowerCase() : null,
       dados.subdominio ? dados.subdominio.toLowerCase() : null,
       dados.remetente_nome || null, dados.remetente_email || null,
       dados.mostrar_powered_by === undefined ? null : !!dados.mostrar_powered_by,
       dados.extra ? JSON.stringify(dados.extra) : null]
    );
    await registrarAuditoria({
      empresaId, usuarioId, categoria: AUDIT_CATEGORIES.BRANDING, acao: 'definir', ip,
    });
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Domínio ou subdomínio já está em uso por outra empresa');
    throw e;
  }
}

module.exports = { resolverEmpresaPorHost, obterPublico, obterCompleto, definir };

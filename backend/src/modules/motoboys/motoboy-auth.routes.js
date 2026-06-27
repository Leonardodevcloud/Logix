const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../../shared/AppError');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant } = require('../../middleware/tenant');
let emitirParaEmpresa = () => {};
try { emitirParaEmpresa = require('../../realtime/ws').emitirParaEmpresa; } catch {}
const { query } = require('../../shared/db');
const { limiteLogin } = require('../../middleware/rateLimit');

// Token simples para o app — sem cookie, sem refresh complexo.
// TTL longo (30 dias) pois o app não pode pedir login toda hora.
const APP_TTL = process.env.JWT_MOTOBOY_TTL || '30d';

function gerarTokenApp(motoboy) {
  return jwt.sign(
    { id: motoboy.id, perfil: 'motoboy', empresaId: motoboy.empresa_id, nome: motoboy.nome_completo },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: APP_TTL }
  );
}

module.exports = function motoboyAuthRoutes() {
  const router = express.Router();

  // POST /motoboys/auth/login
  // Body: { telefone, pin }  — PIN de 6 dígitos definido pelo admin
  router.post('/auth/login', limiteLogin, async (req, res, next) => {
    try {
      const { telefone, pin } = req.body;
      if (!telefone || !pin) throw AppError.validacao('Telefone e PIN obrigatórios');

      // Normalizar telefone (só dígitos)
      const tel = String(telefone).replace(/\D/g, '');

      const { rows } = await query(
        `SELECT id, empresa_id, nome_completo, status, online, foto_url, pin_hash
         FROM motoboys
         WHERE telefone_principal = $1 AND status = 'ativo'
         LIMIT 1`,
        [tel]
      );

      if (!rows[0]) throw AppError.naoAutorizado('Motoboy não encontrado ou inativo');
      const m = rows[0];

      if (!m.pin_hash) throw AppError.naoAutorizado('PIN não configurado. Solicite ao operador.');

      const ok = await bcrypt.compare(String(pin), m.pin_hash);
      if (!ok) throw AppError.naoAutorizado('PIN incorreto');

      // Marcar online
      await query(`UPDATE motoboys SET online = true WHERE id = $1`, [m.id]);
      emitirParaEmpresa(m.empresa_id, 'motoboy.status', { motoboyId: m.id, online: true });

      const token = gerarTokenApp(m);
      res.json({
        token,
        motoboy: {
          id: m.id,
          nome_completo: m.nome_completo,
          empresa_id: m.empresa_id,
          foto_url: m.foto_url,
          online: true,
        },
      });
    } catch (e) { next(e); }
  });

  // POST /motoboys/auth/login-email
  // Body: { slug, email, senha } — login por e-mail/senha (cadastro pelo app).
  router.post('/auth/login-email', limiteLogin, async (req, res, next) => {
    try {
      const { slug, email, senha } = req.body;
      if (!email || !senha) throw AppError.validacao('E-mail e senha obrigatórios');
      const mail = String(email).trim().toLowerCase();

      // Resolve empresa pelo slug (white-label). Se não vier slug, busca o e-mail em qualquer empresa.
      let where = `lower(email) = $1`;
      const params = [mail];
      if (slug) {
        const emp = await query(`SELECT id FROM empresas WHERE lower(slug) = lower($1) AND ativo = TRUE`, [slug]);
        if (!emp.rows[0]) throw AppError.naoEncontrado('Empresa não encontrada');
        params.push(emp.rows[0].id);
        where += ` AND empresa_id = $2`;
      }

      const { rows } = await query(
        `SELECT id, empresa_id, nome_completo, status, online, foto_url, senha_hash, situacao_cadastro
           FROM motoboys WHERE ${where} LIMIT 1`,
        params
      );
      if (!rows[0]) throw AppError.naoAutorizado('E-mail não encontrado');
      const m = rows[0];
      if (!m.senha_hash) throw AppError.naoAutorizado('Senha não configurada. Use login por PIN ou fale com a central.');

      const ok = await bcrypt.compare(String(senha), m.senha_hash);
      if (!ok) throw AppError.naoAutorizado('Senha incorreta');

      // Permite login mesmo pendente (o app mostra a tela de "aguardando aprovação").
      if (m.situacao_cadastro !== 'recusado') {
        await query(`UPDATE motoboys SET online = (situacao_cadastro = 'aprovado') WHERE id = $1`, [m.id]);
      }

      const token = gerarTokenApp(m);
      res.json({
        token,
        motoboy: { id: m.id, nome_completo: m.nome_completo, empresa_id: m.empresa_id, foto_url: m.foto_url, situacao_cadastro: m.situacao_cadastro },
      });
    } catch (e) { next(e); }
  });

  // POST /motoboys/auth/logout
  router.post('/auth/logout', async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        await query(`UPDATE motoboys SET online = false WHERE id = $1`, [decoded.id]);
        emitirParaEmpresa(decoded.empresaId, 'motoboy.status', { motoboyId: decoded.id, online: false });
      }
      res.json({ ok: true });
    } catch { res.json({ ok: true }); }
  });

  // POST /motoboys/:id/pin — admin define/redefine o PIN do motoboy
  router.post('/:id/pin', verificarToken, resolverTenant, async (req, res, next) => {
    try {
      const { pin } = req.body;
      if (!pin || String(pin).length < 4) throw AppError.validacao('PIN deve ter ao menos 4 dígitos');
      const hash = await bcrypt.hash(String(pin), 10);
      // Super_admin pode definir PIN de qualquer motoboy; cliente só da própria empresa
      const empresaFiltro = req.empresaId;
      const sqlWhere = empresaFiltro
        ? `WHERE id = $2 AND empresa_id = $3`
        : `WHERE id = $2`;
      const params = empresaFiltro
        ? [hash, req.params.id, empresaFiltro]
        : [hash, req.params.id];
      const { rows } = await query(
        `UPDATE motoboys SET pin_hash = $1 ${sqlWhere} RETURNING id, nome_completo`,
        params
      );
      if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
      res.json({ ok: true, nome: rows[0].nome_completo });
    } catch (e) { next(e); }
  });

  return router;
};

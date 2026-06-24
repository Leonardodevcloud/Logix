const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../../shared/AppError');
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

  // POST /motoboys/auth/logout
  router.post('/auth/logout', async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        await query(`UPDATE motoboys SET online = false WHERE id = $1`, [decoded.id]);
      }
      res.json({ ok: true });
    } catch { res.json({ ok: true }); }
  });

  // POST /motoboys/:id/pin — admin define/redefine o PIN do motoboy
  router.post('/:id/pin', async (req, res, next) => {
    try {
      const { pin } = req.body;
      if (!pin || String(pin).length < 4) throw AppError.validacao('PIN deve ter ao menos 4 dígitos');
      const hash = await bcrypt.hash(String(pin), 10);
      const { rows } = await query(
        `UPDATE motoboys SET pin_hash = $1 WHERE id = $2 AND empresa_id = $3 RETURNING id, nome_completo`,
        [hash, req.params.id, req.empresaId]
      );
      if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
      res.json({ ok: true, nome: rows[0].nome_completo });
    } catch (e) { next(e); }
  });

  return router;
};

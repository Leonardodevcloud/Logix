const express = require('express');
const { verificarToken, verificarTokenMotoboy } = require('../../middleware/auth');
const { resolverTenant } = require('../../middleware/tenant');
const { criarLimite } = require('../../middleware/rateLimit');
const { validar } = require('../../middleware/validar');
const { z } = require('../../shared/schemas');
const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const service = require('./uploads.service');

const corpo = z.object({
  finalidade: z.enum(['protocolo', 'documento', 'cadastro', 'chat', 'logo']),
  mime: z.string().trim().max(60),
  tamanho: z.coerce.number().int().min(1).max(50 * 1024 * 1024).optional(),
});

// Cadastro público: sem sessão. Limite apertado por IP e só finalidade 'cadastro'.
const limitePublico = criarLimite({ nome: 'upload-publico', windowMs: 10 * 60_000, max: 30 });
const limiteApp = criarLimite({ nome: 'upload-app', windowMs: 60_000, max: 30, keyGenerator: (req) => (req.motoboy && req.motoboy.id) || req.ip });

function initUploadsRoutes() {
  const router = express.Router();

  // Painel (usuário logado). Ex.: logo da marca, documento anexado pelo admin, foto no chat.
  router.post('/url', verificarToken, resolverTenant, validar(corpo), async (req, res, next) => {
    try {
      if (!req.empresaId) throw AppError.validacao('Empresa (tenant) não informada');
      res.json(await service.criarUrlUpload({ empresaId: req.empresaId, ...req.body }));
    } catch (e) { next(e); }
  });

  // App do motoboy (protocolo de entrega, documento, chat).
  router.post('/app/url', verificarTokenMotoboy, limiteApp, validar(corpo), async (req, res, next) => {
    try {
      if (req.body.finalidade === 'logo') throw AppError.proibido('Finalidade não permitida para o app');
      res.json(await service.criarUrlUpload({ empresaId: req.motoboy.empresaId, ...req.body }));
    } catch (e) { next(e); }
  });

  // Cadastro público (link da empresa, antes de existir sessão).
  router.post('/publico/:slug/url', limitePublico, validar(corpo), async (req, res, next) => {
    try {
      if (req.body.finalidade !== 'cadastro') throw AppError.proibido('Só documentos de cadastro neste endpoint');
      const { rows } = await query(`SELECT id FROM empresas WHERE lower(slug) = lower($1) AND ativo = TRUE`, [req.params.slug]);
      if (!rows[0]) throw AppError.naoEncontrado('Empresa não encontrada');
      res.json(await service.criarUrlUpload({ empresaId: rows[0].id, ...req.body }));
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initUploadsRoutes };

const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant, exigirCentral } = require('../../middleware/tenant');
const service = require('./clientehub.service');

function initClienteHubRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant, exigirCentral);

  const base = (req) => ({ empresaId: req.empresaId, lojaId: req.params.lojaId, usuarioId: req.usuario.id, ip: req.ip });

  // ── 1) Status ──────────────────────────────────────────────────
  router.patch('/:lojaId/status', async (req, res, next) => {
    try { res.json(await service.alternarStatus({ ...base(req), ativo: !!req.body.ativo })); } catch (e) { next(e); }
  });

  // ── 2) Centros de custo ────────────────────────────────────────
  router.get('/:lojaId/centros', async (req, res, next) => {
    try { res.json(await service.listarCentros({ empresaId: req.empresaId, lojaId: req.params.lojaId })); } catch (e) { next(e); }
  });
  router.post('/:lojaId/centros', async (req, res, next) => {
    try { res.status(201).json(await service.criarCentro({ ...base(req), nome: req.body.nome, codigo: req.body.codigo })); } catch (e) { next(e); }
  });
  router.put('/:lojaId/centros/:id', async (req, res, next) => {
    try { res.json(await service.atualizarCentro({ ...base(req), id: req.params.id, nome: req.body.nome, codigo: req.body.codigo, ativo: req.body.ativo })); } catch (e) { next(e); }
  });
  router.delete('/:lojaId/centros/:id', async (req, res, next) => {
    try { res.json(await service.excluirCentro({ ...base(req), id: req.params.id })); } catch (e) { next(e); }
  });
  router.post('/:lojaId/centros/:centroId/usuarios', async (req, res, next) => {
    try { res.status(201).json(await service.criarUsuarioCentro({ ...base(req), centroId: req.params.centroId, nome: req.body.nome, email: req.body.email, telefone: req.body.telefone, senha: req.body.senha })); } catch (e) { next(e); }
  });

  // ── 3) Usuários avulsos ────────────────────────────────────────
  router.get('/:lojaId/usuarios', async (req, res, next) => {
    try { res.json(await service.listarUsuarios({ empresaId: req.empresaId, lojaId: req.params.lojaId })); } catch (e) { next(e); }
  });
  router.post('/:lojaId/usuarios', async (req, res, next) => {
    try { res.status(201).json(await service.criarUsuario({ ...base(req), nome: req.body.nome, email: req.body.email, telefone: req.body.telefone, senha: req.body.senha })); } catch (e) { next(e); }
  });
  router.put('/:lojaId/usuarios/:id', async (req, res, next) => {
    try { res.json(await service.atualizarUsuario({ ...base(req), id: req.params.id, nome: req.body.nome, telefone: req.body.telefone, ativo: req.body.ativo })); } catch (e) { next(e); }
  });
  router.delete('/:lojaId/usuarios/:id', async (req, res, next) => {
    try { res.json(await service.excluirUsuario({ ...base(req), id: req.params.id })); } catch (e) { next(e); }
  });

  // ── 4) Modalidades ─────────────────────────────────────────────
  router.get('/:lojaId/modalidades', async (req, res, next) => {
    try { res.json(await service.listarModalidades({ empresaId: req.empresaId, lojaId: req.params.lojaId })); } catch (e) { next(e); }
  });
  router.get('/:lojaId/modalidades/disponiveis', async (req, res, next) => {
    try { res.json(await service.categoriasDisponiveis({ empresaId: req.empresaId, lojaId: req.params.lojaId })); } catch (e) { next(e); }
  });
  router.post('/:lojaId/modalidades', async (req, res, next) => {
    try { res.status(201).json(await service.adicionarModalidade({ ...base(req), categoriaId: req.body.categoriaId, soExclusivos: req.body.soExclusivos })); } catch (e) { next(e); }
  });
  router.put('/:lojaId/modalidades/:id', async (req, res, next) => {
    try { res.json(await service.atualizarModalidade({ ...base(req), id: req.params.id, soExclusivos: req.body.soExclusivos, ativo: req.body.ativo })); } catch (e) { next(e); }
  });
  router.delete('/:lojaId/modalidades/:id', async (req, res, next) => {
    try { res.json(await service.removerModalidade({ ...base(req), id: req.params.id })); } catch (e) { next(e); }
  });

  // ── 5) Regras de acionamento ───────────────────────────────────
  router.get('/:lojaId/regras', async (req, res, next) => {
    try { res.json(await service.obterRegras({ empresaId: req.empresaId, lojaId: req.params.lojaId })); } catch (e) { next(e); }
  });
  router.put('/:lojaId/regras', async (req, res, next) => {
    try { res.json(await service.salvarRegras({ ...base(req), maxCorridas: req.body.maxCorridas, raioKm: req.body.raioKm })); } catch (e) { next(e); }
  });

  // ── 6) Motoboys exclusivos ─────────────────────────────────────
  router.get('/:lojaId/motoboys', async (req, res, next) => {
    try { res.json(await service.listarMotoboysExclusivos({ empresaId: req.empresaId, lojaId: req.params.lojaId })); } catch (e) { next(e); }
  });
  router.get('/:lojaId/motoboys/disponiveis', async (req, res, next) => {
    try { res.json(await service.motoboysDisponiveis({ empresaId: req.empresaId })); } catch (e) { next(e); }
  });
  router.post('/:lojaId/motoboys', async (req, res, next) => {
    try { res.status(201).json(await service.atribuirMotoboy({ ...base(req), motoboyId: req.body.motoboyId, modalidadeId: req.body.modalidadeId })); } catch (e) { next(e); }
  });
  router.delete('/:lojaId/motoboys/:id', async (req, res, next) => {
    try { res.json(await service.removerMotoboy({ ...base(req), id: req.params.id })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initClienteHubRoutes };

const express = require('express');
const AppError = require('../../shared/AppError');
const { query } = require('../../shared/db');
const { verificarToken } = require('../../middleware/auth');
const { verificarTokenMotoboy } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const service = require('./cadastro.service');
const { consultarCep } = require('../../integracoes/cep');

// ── Rotas PÚBLICAS do cadastro (app, sem login) ───────────────────
// Resolve a empresa pelo slug e permite o pré-cadastro.
function rotasPublicasCadastro() {
  const router = express.Router();

  // GET /motoboys/cadastro/contexto/:slug — dados para a tela de cadastro:
  // modalidades de interesse + quais campos são obrigatórios.
  router.get('/contexto/:slug', async (req, res, next) => {
    try {
      const { rows } = await query(`SELECT id, nome_fantasia, razao_social FROM empresas WHERE lower(slug) = lower($1) AND ativo = TRUE`, [req.params.slug]);
      if (!rows[0]) throw AppError.naoEncontrado('Empresa não encontrada');
      const empresaId = rows[0].id;
      const [modalidades, campos] = await Promise.all([
        service.listarModalidadesInteresse({ empresaId, somenteAtivas: true }),
        service.obterConfigCadastro(empresaId),
      ]);
      res.json({ empresa: { id: empresaId, nome: rows[0].nome_fantasia || rows[0].razao_social }, modalidades, campos });
    } catch (e) { next(e); }
  });

  // GET /motoboys/cadastro/cep/:cep — autopreenchimento de endereço.
  router.get('/cep/:cep', async (req, res, next) => {
    try { res.json(await consultarCep(req.params.cep)); } catch (e) { next(e); }
  });

  // POST /motoboys/cadastro/:slug — cria o pré-cadastro.
  router.post('/:slug', async (req, res, next) => {
    try {
      const { rows } = await query(`SELECT id FROM empresas WHERE lower(slug) = lower($1) AND ativo = TRUE`, [req.params.slug]);
      if (!rows[0]) throw AppError.naoEncontrado('Empresa não encontrada');
      res.status(201).json(await service.cadastrarPeloApp({ empresaId: rows[0].id, dados: req.body }));
    } catch (e) { next(e); }
  });

  return router;
}

// ── Rotas do APP autenticado (motoboy logado) ─────────────────────
function rotasAppCadastro() {
  const router = express.Router();

  // GET /motoboys/app/meu-cadastro — situação (para bloqueio/redirecionamento).
  router.get('/meu-cadastro', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await service.meuCadastro({ empresaId: req.motoboy.empresaId, motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });

  // POST /motoboys/app/reenviar-cadastro — reenvio após solicitação da central.
  router.post('/reenviar-cadastro', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await service.reenviarCadastro({ empresaId: req.motoboy.empresaId, motoboyId: req.motoboy.id, dados: req.body })); } catch (e) { next(e); }
  });

  return router;
}

// ── Rotas da CENTRAL (admin) ──────────────────────────────────────
function rotasCentralCadastro() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant);

  // Lista de cadastros (com contadores).
  router.get('/cadastros', async (req, res, next) => {
    try { res.json(await service.listarCadastros({ empresaId: req.empresaId, situacao: req.query.situacao || null, busca: req.query.busca || null, criadoDe: req.query.criado_de || null, criadoAte: req.query.criado_ate || null, ativadoDe: req.query.ativado_de || null, ativadoAte: req.query.ativado_ate || null })); } catch (e) { next(e); }
  });

  // Cadastro pela central (admin) — nada obrigatório, já entra ativo.
  router.post('/cadastros', async (req, res, next) => {
    try { res.status(201).json(await service.cadastrarPeloAdmin({ empresaId: req.empresaId, dados: req.body, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });

  // Detalhe completo (com documentos e URLs).
  router.get('/cadastros/:id', async (req, res, next) => {
    try { res.json(await service.detalheCadastro({ empresaId: req.empresaId, motoboyId: req.params.id })); } catch (e) { next(e); }
  });

  // Aprovar / recusar / reenvio.
  router.post('/cadastros/:id/aprovar', async (req, res, next) => {
    try { res.json(await service.aprovarCadastro({ empresaId: req.empresaId, motoboyId: req.params.id, usuarioId: req.usuario.id, ip: req.ip })); } catch (e) { next(e); }
  });
  router.post('/cadastros/:id/recusar', async (req, res, next) => {
    try { res.json(await service.recusarCadastro({ empresaId: req.empresaId, motoboyId: req.params.id, motivo: req.body.motivo, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });
  router.post('/cadastros/:id/reenvio', async (req, res, next) => {
    try { res.json(await service.solicitarReenvio({ empresaId: req.empresaId, motoboyId: req.params.id, motivo: req.body.motivo, docsParaRemover: req.body.docs_para_remover || [], usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });

  // Ativar / desativar (status operacional).
  router.post('/cadastros/:id/ativar', async (req, res, next) => {
    try { res.json(await service.ativarMotoboy({ empresaId: req.empresaId, motoboyId: req.params.id })); } catch (e) { next(e); }
  });
  router.post('/cadastros/:id/desativar', async (req, res, next) => {
    try { res.json(await service.desativarMotoboy({ empresaId: req.empresaId, motoboyId: req.params.id })); } catch (e) { next(e); }
  });

  // Editar dados (inclui senha).
  router.put('/cadastros/:id', async (req, res, next) => {
    try { res.json(await service.editarCadastro({ empresaId: req.empresaId, motoboyId: req.params.id, dados: req.body, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });

  // Remover um documento.
  router.delete('/cadastros/:id/documentos/:tipo', async (req, res, next) => {
    try { res.json(await service.removerDocumento({ empresaId: req.empresaId, motoboyId: req.params.id, tipo: req.params.tipo, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });

  // ── Config de cadastro (campos obrigatórios) ────────────────────
  router.get('/cadastro-config', async (req, res, next) => {
    try { res.json({ campos: await service.obterConfigCadastro(req.empresaId) }); } catch (e) { next(e); }
  });
  router.put('/cadastro-config', async (req, res, next) => {
    try { res.json(await service.salvarConfigCadastro({ empresaId: req.empresaId, campos: req.body.campos, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });

  // ── Modalidades de interesse ────────────────────────────────────
  router.get('/modalidades-interesse', async (req, res, next) => {
    try { res.json({ modalidades: await service.listarModalidadesInteresse({ empresaId: req.empresaId }) }); } catch (e) { next(e); }
  });
  router.post('/modalidades-interesse', async (req, res, next) => {
    try { res.status(201).json(await service.criarModalidadeInteresse({ empresaId: req.empresaId, ...req.body })); } catch (e) { next(e); }
  });
  router.put('/modalidades-interesse/:id', async (req, res, next) => {
    try { res.json(await service.atualizarModalidadeInteresse({ empresaId: req.empresaId, id: req.params.id, ...req.body })); } catch (e) { next(e); }
  });
  router.delete('/modalidades-interesse/:id', async (req, res, next) => {
    try { res.json(await service.excluirModalidadeInteresse({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { rotasPublicasCadastro, rotasAppCadastro, rotasCentralCadastro };

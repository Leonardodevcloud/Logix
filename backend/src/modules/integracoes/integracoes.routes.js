const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant, exigirCentral } = require('../../middleware/tenant');
const { exigirPermissao } = require('../../middleware/permissoes');
const service = require('./integracoes.service');

// Painel: gestão das chaves de integração. Ferramenta da central.
//   ver     -> integracoes.ver
//   alterar -> integracoes.gerenciar
function initIntegracoesRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant, exigirCentral);

  // Lista das chaves da empresa
  router.get('/chaves', exigirPermissao('integracoes.ver'), async (req, res, next) => {
    try { res.json(await service.listarChaves(req.empresaId)); } catch (e) { next(e); }
  });

  // Cria uma chave — devolve o segredo-base + tokens UMA ÚNICA VEZ
  router.post('/chaves', exigirPermissao('integracoes.gerenciar'), async (req, res, next) => {
    try {
      res.status(201).json(await service.criarChave({
        empresaId: req.empresaId, dados: req.body, usuarioId: req.usuario.id,
      }));
    } catch (e) {
      if (e && e.operacional) return next(e);
      console.error('[integracoes.criarChave]', e);
      return res.status(400).json({ erro: 'Falha ao criar chave: ' + (e.message || 'erro interno') });
    }
  });

  // Atualiza nome / loja / url de notificação / operações
  router.put('/chaves/:id', exigirPermissao('integracoes.gerenciar'), async (req, res, next) => {
    try { res.json(await service.atualizarChave({ empresaId: req.empresaId, id: req.params.id, dados: req.body })); }
    catch (e) {
      if (e && e.operacional) return next(e);
      console.error('[integracoes.atualizarChave]', e);
      return res.status(400).json({ erro: 'Falha ao salvar: ' + (e.message || 'erro interno') });
    }
  });

  // Ativa/desativa
  router.patch('/chaves/:id/ativa', exigirPermissao('integracoes.gerenciar'), async (req, res, next) => {
    try { res.json(await service.alternarAtiva({ empresaId: req.empresaId, id: req.params.id, ativa: req.body.ativa })); }
    catch (e) { next(e); }
  });

  // Regenera o segredo-base (invalida os tokens antigos)
  router.post('/chaves/:id/regenerar', exigirPermissao('integracoes.gerenciar'), async (req, res, next) => {
    try { res.json(await service.regenerarToken({ empresaId: req.empresaId, id: req.params.id })); }
    catch (e) { next(e); }
  });

  // Remove a chave de vez
  router.delete('/chaves/:id', exigirPermissao('integracoes.gerenciar'), async (req, res, next) => {
    try { res.json(await service.revogarChave({ empresaId: req.empresaId, id: req.params.id })); }
    catch (e) { next(e); }
  });

  // Últimas requisições recebidas por essa chave (auditoria)
  router.get('/chaves/:id/requisicoes', exigirPermissao('integracoes.ver'), async (req, res, next) => {
    try {
      const { query } = require('../../shared/db');
      const { rows } = await query(
        `SELECT operacao, os, referencia_externa, status_http, erro, ip, criado_em
           FROM integracoes_requisicoes
          WHERE chave_id = $1 AND empresa_id = $2
          ORDER BY criado_em DESC LIMIT 100`,
        [req.params.id, req.empresaId]);
      res.json(rows);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initIntegracoesRoutes };

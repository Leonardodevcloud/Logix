// Rotas do módulo de Relatórios. Acessível por central e por loja.
// Gate por permissão 'entregas.ver' (a loja tem) — NÃO usa exigirModulo('relatorios').
const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant } = require('../../middleware/tenant');
const { exigirPermissao } = require('../../middleware/permissoes');
const service = require('./relatorios.service');

function initRelatoriosRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant);

  // Monta o objeto de filtros a partir da query, aplicando as regras de RBAC:
  // - loja (req.lojaId setado): trava na própria loja, sem motoboy e sem valor do motoboy.
  // - central/admin (req.lojaId nulo): pode filtrar loja, motoboy e ver valores do motoboy.
  function filtrosDe(req) {
    const ehAdmin = !req.lojaId;
    return {
      empresaId: req.empresaId,
      ehAdmin,
      lojaId: req.lojaId || (ehAdmin ? (req.query.loja_id || null) : null),
      centroId: req.query.centro_id || null,
      motoboyId: ehAdmin ? (req.query.motoboy_id || null) : null,
      motoboyBusca: ehAdmin ? (req.query.motoboy_busca || null) : null,
      exibirValores: req.query.exibir_valores || 'ambos',
      status: req.query.status || null,
      categoriaId: req.query.categoria_id || null,
      baseData: req.query.base || 'criacao',
      de: req.query.de || null,
      ate: req.query.ate || null,
      sla: req.query.sla || null,
      ordenar: req.query.ordenar || null,
      limite: req.query.limite || 100,
      offset: req.query.offset || 0,
      todos: req.query.todos === '1' || req.query.todos === 'true',
      comEnderecos: req.query.enderecos !== 'sem',
    };
  }

  // Opções para os dropdowns (categorias de frete; lojas só p/ admin).
  router.get('/opcoes', exigirPermissao('entregas.ver'), async (req, res, next) => {
    try { res.json(await service.opcoes({ empresaId: req.empresaId, ehAdmin: !req.lojaId })); }
    catch (e) { next(e); }
  });

  // Relatório na tela: { resumo, linhas, ver_motoboy, com_enderecos }.
  router.get('/', exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const f = filtrosDe(req);
      const [resumo, linhas] = await Promise.all([service.resumoRelatorio(f), service.gerarRelatorio(f)]);
      res.json({ resumo, linhas, ver_motoboy: f.ehAdmin, com_enderecos: f.comEnderecos });
    } catch (e) { next(e); }
  });

  // Exportação (xls | csv) — traz todos os registros do filtro.
  router.get('/export', exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const f = filtrosDe(req); f.todos = true;
      const linhas = await service.gerarRelatorio(f);
      const formato = req.query.formato === 'csv' ? 'csv' : 'xls';
      const { conteudo, mime, nome } = service.exportar(linhas, { verMotoboy: f.ehAdmin, comEnderecos: f.comEnderecos, formato, exibirValores: f.exibirValores });
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.send(conteudo);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initRelatoriosRoutes };

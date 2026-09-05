const express = require('express');
const { criarLimite } = require('../../middleware/rateLimit');
const service = require('./integracoes.service');

// API pública para os sistemas dos clientes (ERP) criarem/consultarem/cancelarem
// corridas. Autenticação por cod_cliente + token no CORPO (não usa JWT).
// Montada FORA dos guards de módulo; tem limitador próprio por chave.

// A URL de rastreio é resolvida por tenant dentro do service (domínio do próprio
// cliente), então a rota não precisa passar base nenhuma.

// Chave do limitador = cod_cliente (cai no IP se ausente).
const chaveLimite = (req) => (req.body && req.body.codCliente) ? String(req.body.codCliente) : req.ip;

// 2 gravações por segundo por cliente (janela de 1s, teto 2).
const limiteGravar = criarLimite({
  nome: 'integ-gravar', windowMs: 1000, max: 2, keyGenerator: chaveLimite,
  message: { Erro: 'Só é permitido solicitar 2 serviços por segundo.' },
});
// 1 consulta a cada 30s por cliente.
const limiteStatus = criarLimite({
  nome: 'integ-status', windowMs: 30_000, max: 1, keyGenerator: chaveLimite,
  message: { Erro: 'É permitido realizar uma consulta a cada 30 segundos.' },
});
const limiteCalcular = criarLimite({
  nome: 'integ-calcular', windowMs: 1000, max: 2, keyGenerator: chaveLimite,
});

// Resolve a credencial da operação e injeta req.credencial. Erros saem no formato
// { "Erro": "..." } (contrato externo), não no envelope padrão do sistema.
function autenticar(operacao) {
  return async (req, res, next) => {
    try {
      req.credencial = await service.resolverCredencial({
        codCliente: req.body.codCliente,
        token: req.body.token || req.body.Token,
        operacao,
      });
      next();
    } catch (e) {
      return res.status(200).json({ Erro: e.message || 'Não autorizado' });
    }
  };
}

function initIntegracoesPublicRoutes() {
  const router = express.Router();

  // GRAVAR (criar corrida)
  router.post('/gravar', limiteGravar, autenticar('gravar'), async (req, res) => {
    try {
      const resp = await service.gravarServico({
        credencial: req.credencial, body: req.body, ip: req.ip,
      });
      service.logarRequisicao({
        empresaId: req.credencial.empresaId, chaveId: req.credencial.chaveId, operacao: 'gravar',
        os: resp && resp.Sucesso, entregaId: resp && resp._entregaId,
        referenciaExterna: req.body.numeroPedido, statusHttp: 200, ip: req.ip,
      });
      if (resp && resp._entregaId) delete resp._entregaId;
      res.status(200).json(resp);
    } catch (e) {
      service.logarRequisicao({
        empresaId: req.credencial && req.credencial.empresaId, chaveId: req.credencial && req.credencial.chaveId,
        operacao: 'gravar', referenciaExterna: req.body.numeroPedido, statusHttp: 400, erro: e.message, ip: req.ip,
      });
      res.status(200).json({ Erro: e.message || 'Erro ao gravar servico' });
    }
  });

  // STATUS (consulta)
  router.post('/status', limiteStatus, autenticar('status'), async (req, res) => {
    try {
      const resp = await service.statusServico({ credencial: req.credencial, body: req.body });
      service.logarRequisicao({
        empresaId: req.credencial.empresaId, chaveId: req.credencial.chaveId, operacao: 'status',
        os: req.body.servico, statusHttp: 200, ip: req.ip,
      });
      res.status(200).json(resp);
    } catch (e) {
      res.status(200).json({ Erro: e.message || 'Serviço não encontrado.' });
    }
  });

  // CANCELAR
  router.post('/cancelar', autenticar('cancelar'), async (req, res) => {
    try {
      const resp = await service.cancelarServico({ credencial: req.credencial, body: req.body, ip: req.ip });
      service.logarRequisicao({
        empresaId: req.credencial.empresaId, chaveId: req.credencial.chaveId, operacao: 'cancelar',
        os: req.body.OS || req.body.os, entregaId: resp && resp._entregaId, statusHttp: 200, ip: req.ip,
      });
      if (resp && resp._entregaId) delete resp._entregaId;
      res.status(200).json(resp);
    } catch (e) {
      res.status(200).json({ Erro: e.message || 'Erro ao cancelar' });
    }
  });

  // CALCULAR (prévia de preço, sem gravar)
  router.post('/calcular', limiteCalcular, autenticar('calcular'), async (req, res) => {
    try {
      res.status(200).json(await service.calcularServico({ credencial: req.credencial, body: req.body }));
    } catch (e) {
      res.status(200).json({ Erro: e.message || 'Erro ao calcular' });
    }
  });

  // CENTROS (lista os centros de custo disponíveis para a loja) — leitura, usa o token de status.
  router.post('/centros', limiteStatus, autenticar('status'), async (req, res) => {
    try {
      res.status(200).json(await service.listarCentros({ credencial: req.credencial }));
    } catch (e) {
      res.status(200).json({ Erro: e.message || 'Erro ao listar centros' });
    }
  });

  // CATEGORIAS (lista as categorias disponíveis para a loja) — leitura, usa o token de status.
  router.post('/categorias', limiteStatus, autenticar('status'), async (req, res) => {
    try {
      res.status(200).json(await service.listarCategorias({ credencial: req.credencial }));
    } catch (e) {
      res.status(200).json({ Erro: e.message || 'Erro ao listar categorias' });
    }
  });

  // PROFISSIONAIS (lista os profissionais vinculados à loja) — leitura, usa o token de status.
  router.post('/profissionais', limiteStatus, autenticar('status'), async (req, res) => {
    try {
      res.status(200).json(await service.listarProfissionais({ credencial: req.credencial }));
    } catch (e) {
      res.status(200).json({ Erro: e.message || 'Erro ao listar profissionais' });
    }
  });

  // OPENAPI (público): especificação da API de integração para ERPs/geradores de cliente.
  router.get('/openapi.json', (req, res) => {
    const { gerarOpenApi } = require('./integracoes.openapi');
    const baseUrl = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.set('Cache-Control', 'public, max-age=300');
    res.json(gerarOpenApi({ baseUrl }));
  });

  // RASTREIO PÚBLICO (consumido pela página do cliente) — o token é o segredo.
  router.get('/rastreio/:token', async (req, res) => {
    try { res.json(await service.rastreioPublico(req.params.token)); }
    catch (e) { res.status(404).json({ erro: e.message || 'Rastreio não encontrado' }); }
  });

  return router;
}

module.exports = { initIntegracoesPublicRoutes };

// OpenAPI 3.1 da API pública de integração (/api/v1/integracao).
// Fonte única: este arquivo gera /api/v1/integracao/openapi.json (consumido pelo
// Swagger UI em /openapi.html do painel e por geradores de cliente dos ERPs).
// Regra: mudou um campo da API pública → muda aqui no MESMO commit.
const { version } = require('../../../package.json');

const ponto = {
  type: 'object',
  description: 'Um ponto da corrida. O primeiro é a coleta. Informe endereço em texto OU coordenadas (la/lo); ao menos um dos dois.',
  properties: {
    rua: { type: 'string', description: 'Logradouro (condicional)' },
    numero: { type: 'string' },
    complemento: { type: 'string', description: 'Apto, bloco, referência' },
    bairro: { type: 'string' },
    cidade: { type: 'string' },
    uf: { type: 'string', minLength: 2, maxLength: 2 },
    cep: { type: 'string' },
    la: { type: 'string', description: 'Latitude (condicional). Quando vem, é usada diretamente.', example: '-12.978' },
    lo: { type: 'string', description: 'Longitude (condicional)', example: '-38.458' },
    telefone: { type: 'string' },
    procurarPor: { type: 'string', description: 'Nome de quem procurar/receber' },
    numeroNota: { type: 'string', description: 'Nota fiscal do ponto' },
    obs: { type: 'string', description: 'Observação para o entregador' },
  },
};

const credenciais = {
  token: { type: 'string', description: 'Token da operação: `<segredo>-gravar`, `-status`, `-cancelar` ou `-calcular`.' },
  codCliente: { type: 'string', description: 'Código público da loja.' },
};

const erro = {
  type: 'object',
  required: ['Erro'],
  properties: { Erro: { type: 'string', example: 'Token inválido' } },
  description: 'Toda falha volta com HTTP 200 e a chave `Erro`. Verifique `Sucesso` vs `Erro` antes de prosseguir.',
};

const respostaOk = (sucesso, descricao) => ({
  description: descricao || 'Resultado. Sucesso traz a chave `Sucesso`; falha traz `Erro`.',
  content: { 'application/json': { schema: { oneOf: [{ type: 'object', required: ['Sucesso'], properties: { Sucesso: sucesso } }, { $ref: '#/components/schemas/Erro' }] } } },
});

const statusPonto = {
  type: 'object',
  properties: {
    ponto: { type: 'string', example: '1' },
    IDponto: { type: 'string', format: 'uuid' },
    obs: { type: 'string' },
    numeroNota: { type: 'string' },
    statusPonto: {
      type: 'object',
      properties: {
        chegada: { type: 'string', example: '2026-08-24 14:05:10' },
        saida: { type: 'string', example: '2026-08-24 14:12:33' },
        ocorrencia: { type: 'string', example: 'Sucesso' },
        motivo: { type: 'string' },
        protocoloAssinatura: { type: 'array', items: {} },
        assinatura: { type: 'array', items: {} },
        protocolo: { type: 'array', items: {} },
        linkRastreamento: { type: 'string' },
      },
    },
    coordernadasPonto: { type: 'object', properties: { la: { type: 'string' }, lo: { type: 'string' } } },
    codigo: { type: 'string' }, codigoCompleto: { type: 'string' }, descricao: { type: 'string' }, codigoFinalizarEnd: { type: 'string' },
  },
};

const statusCorrida = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['SP', 'A', 'F', 'C'], description: 'SP = sem profissional (na fila); A = em execução; F = finalizada; C = cancelada.' },
    urlRastreamento: { type: 'string', format: 'uri' },
    pontos: { type: 'array', items: statusPonto },
    dadosProfissional: { type: 'object', properties: { nome: { type: 'string' }, cpf: { type: 'string' }, placa: { type: 'string' } } },
    valorServico: { type: 'number', example: 25.5 },
    valorProfissional: { type: 'number', example: 18.0 },
  },
};

function gerarOpenApi({ baseUrl }) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Logix — API de Integração',
      version,
      description: [
        'API para o sistema da loja criar, consultar e cancelar corridas e receber notificações por webhook.',
        '',
        '**Autenticação:** `codCliente` + `token` **no corpo** de cada requisição (não usa header). Há um token por operação.',
        '',
        '**Convenção de resposta:** toda chamada responde **HTTP 200**. Sucesso traz a chave `Sucesso`; falha traz `Erro` com a mensagem. Verifique qual veio antes de prosseguir.',
        '',
        '**Limites:** `/gravar` e `/calcular` 2 req/s por chave; `/status` e listagens 1 req/30 s por chave.',
      ].join('\n'),
      contact: { name: 'Suporte Logix' },
    },
    servers: [{ url: `${baseUrl}/api/v1/integracao` }],
    tags: [
      { name: 'Corridas', description: 'Criar, consultar, cancelar e calcular.' },
      { name: 'Catálogos', description: 'Listas para preencher os campos opcionais do gravar (usam o token de status).' },
      { name: 'Rastreio', description: 'Dados da página pública de acompanhamento.' },
      { name: 'Webhook', description: 'Notificações enviadas pela plataforma ao sistema da loja.' },
    ],
    paths: {
      '/gravar': {
        post: {
          tags: ['Corridas'], summary: 'Criar corrida', operationId: 'gravar',
          description: 'Cria uma corrida. `pontos` deve ter de 2 a 80 itens (o 1º é a coleta). Com `ordenar: "true"` o máximo é 20. `numeroPedido` dá idempotência: reenviar a mesma requisição não duplica a corrida.',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['token', 'codCliente', 'pontos'],
            properties: {
              ...credenciais,
              pontos: { type: 'array', minItems: 2, maxItems: 80, items: { $ref: '#/components/schemas/Ponto' } },
              centroCusto: { type: 'string', description: 'Código ou nome do centro de custo (ver /centros).' },
              categoria: { type: 'string', description: 'Nome da categoria/modalidade (ver /categorias).' },
              codigoProf: { type: 'integer', description: 'Direciona a um profissional (ver /profissionais). Se não puder assumir, a corrida é criada sem ele e o motivo vem em detalhes.' },
              numeroPedido: { type: 'string', description: 'Pedido/nota no sistema da loja. Idempotência.' },
              semProfissional: { type: 'string', enum: ['S', 'N'], description: '"S" = entra na fila sem oferta automática.' },
              ordenar: { type: 'string', enum: ['true', 'false'], description: '"false" mantém a ordem enviada; caso contrário a rota é otimizada (máx 20 pontos).' },
            },
          }, example: {
            token: '<segredo>-gravar', codCliente: '<codigo da loja>', numeroPedido: '1234', ordenar: 'true', centroCusto: 'MATRIZ', categoria: 'Moto',
            pontos: [
              { rua: 'Av. Tancredo Neves', numero: '620', bairro: 'Caminho das Árvores', cidade: 'Salvador', uf: 'BA', cep: '41820-020', la: '-12.978', lo: '-38.458' },
              { rua: 'R. das Flores', numero: '100', bairro: 'Pituba', cidade: 'Salvador', uf: 'BA', la: '-12.995', lo: '-38.451', procurarPor: 'Maria', telefone: '71 90000-0000', numeroNota: '998', obs: 'Deixar na portaria' },
            ],
          } } } },
          responses: { 200: respostaOk({ type: 'string', description: 'Número da corrida (OS)', example: 'LX-1287' }, 'Corrida criada. Além de `Sucesso`, vem `detalhes` com distância (km), duração (HH:MM:SS), valor (R$), urlRastreamento e, se o profissional pedido não pôde assumir, `profissionalNaoAlocado`, `codigoProfInformado` e `mensagem`.') },
        },
      },
      '/status': {
        post: {
          tags: ['Corridas'], summary: 'Consultar status', operationId: 'status',
          description: 'Informe UM destes: `servico` (uma OS), `servicos` (até 50) ou `numeroNota`. Com `servicos`/`numeroNota`, o retorno vem indexado pela OS.',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['token', 'codCliente'],
            properties: { ...credenciais, servico: { type: 'string', example: 'LX-1287' }, servicos: { type: 'array', maxItems: 50, items: { type: 'string' } }, numeroNota: { type: 'string' } },
          } } } },
          responses: { 200: respostaOk({ oneOf: [{ $ref: '#/components/schemas/StatusCorrida' }, { type: 'object', additionalProperties: { $ref: '#/components/schemas/StatusCorrida' }, description: 'Indexado pela OS' }] }) },
        },
      },
      '/cancelar': {
        post: {
          tags: ['Corridas'], summary: 'Cancelar corrida', operationId: 'cancelar',
          description: 'Na fila: cancela. Já associada a um profissional: só se a loja tiver permissão (senão `Erro: "Alocado"`). Finalizada: não cancela (`Alocado`).',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['token', 'codCliente', 'OS'],
            properties: { ...credenciais, OS: { type: 'string', example: 'LX-1287' }, descricaoMotivo: { type: 'string' } },
          } } } },
          responses: { 200: respostaOk({ type: 'string', enum: ['Cancelado'] }) },
        },
      },
      '/calcular': {
        post: {
          tags: ['Corridas'], summary: 'Calcular preço (prévia)', operationId: 'calcular',
          description: 'Distância, tempo e valor sem criar a corrida. Usa a tabela de preço da loja.',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['token', 'codCliente', 'pontos'],
            properties: { ...credenciais, pontos: { type: 'array', minItems: 2, items: { $ref: '#/components/schemas/Ponto' } } },
          } } } },
          responses: { 200: respostaOk({ type: 'object', properties: { distancia: { type: 'number', example: 8.7 }, duracao: { type: 'string', example: '00:21:00' }, valor: { type: 'string', example: '25.50' } } }) },
        },
      },
      '/centros': { post: { tags: ['Catálogos'], summary: 'Centros de custo da loja', operationId: 'centros', requestBody: { $ref: '#/components/requestBodies/Consulta' },
        responses: { 200: respostaOk({ type: 'array', items: { type: 'object', properties: { codigo: { type: 'string' }, nome: { type: 'string' } } } }) } } },
      '/categorias': { post: { tags: ['Catálogos'], summary: 'Categorias (modalidades) da loja', operationId: 'categorias', requestBody: { $ref: '#/components/requestBodies/Consulta' },
        responses: { 200: respostaOk({ type: 'array', items: { type: 'object', properties: { nome: { type: 'string' } } } }) } } },
      '/profissionais': { post: { tags: ['Catálogos'], summary: 'Profissionais vinculados à loja', operationId: 'profissionais', requestBody: { $ref: '#/components/requestBodies/Consulta' },
        responses: { 200: respostaOk({ type: 'array', items: { type: 'object', properties: { codigoProf: { type: 'integer' }, nome: { type: 'string' } } } }) } } },
      '/rastreio/{token}': {
        get: {
          tags: ['Rastreio'], summary: 'Dados do rastreio público', operationId: 'rastreio',
          description: 'Consumido pela página pública de acompanhamento. O token é o segredo (capability URL) — vem em `urlRastreamento`.',
          parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Status, pontos, posição do entregador e trajeto.' }, 404: { description: 'Rastreio não encontrado.' } },
        },
      },
    },
    webhooks: {
      notificacaoStatus: {
        post: {
          tags: ['Webhook'], summary: 'Notificação de etapa da corrida',
          description: [
            'POST enviado à URL de notificação da integração a cada etapa. Header `x-lx-signature: sha256=<HMAC-SHA256 do corpo exato com o segredo do webhook>`.',
            'Responda HTTP 200 em até 5 s. Envio único por etapa; para o estado atual use /status.',
            '',
            '`Status.ID`: 0 = entregador recebeu · 0.5 = chegou na coleta · 0.75 = saiu em rota · 1 = finalizou um ponto (traz `statusEndereco`) · 2 = finalizou a corrida · 3 = cancelada (traz `cancelamento`).',
          ].join('\n'),
          requestBody: { content: { 'application/json': { schema: {
            type: 'object',
            properties: {
              ID: { type: 'string', example: 'LX-1287' },
              Status: { type: 'object', properties: { ID: { type: 'number', enum: [0, 0.5, 0.75, 1, 2, 3] }, Nome: { type: 'string' }, telefone: { type: 'string' }, dataHora: { type: 'string' } } },
              UrlRastreamento: { type: 'string', format: 'uri' },
              coordenadasMotoboy: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' }, em: { type: 'string' } } },
              valorServico: { type: 'number' }, valorProfissional: { type: 'number' },
              referenciaExterna: { type: 'string', description: 'O numeroPedido enviado no gravar' },
              statusEndereco: { type: 'object', description: 'Só em Status.ID = 1' },
              cancelamento: { type: 'object', description: 'Só em Status.ID = 3', properties: { descricaoMotivo: { type: 'string' }, temMulta: { type: 'boolean' } } },
            },
          } } } },
          responses: { 200: { description: 'Recebido.' } },
        },
      },
    },
    components: {
      schemas: { Ponto: ponto, Erro: erro, StatusCorrida: statusCorrida },
      requestBodies: {
        Consulta: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token', 'codCliente'], properties: { ...credenciais } }, example: { token: '<segredo>-status', codCliente: '<codigo da loja>' } } } },
      },
    },
  };
}

module.exports = { gerarOpenApi };

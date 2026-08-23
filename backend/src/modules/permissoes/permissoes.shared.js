// Catálogo de módulos vendáveis e o conjunto de permissões de cada um.

const MODULOS = [
  { codigo: 'entregas', nome: 'Entregas', categoria: 'Operação', ordem: 1 },
  { codigo: 'motoboys', nome: 'Motoboys', categoria: 'Operação', ordem: 2 },
  { codigo: 'rastreamento', nome: 'Rastreamento', categoria: 'Operação', ordem: 3 },
  { codigo: 'filas', nome: 'Filas', categoria: 'Operação', ordem: 4 },
  { codigo: 'lojas', nome: 'Lojas (Clientes)', categoria: 'Operação', ordem: 5 },
  { codigo: 'financeiro', nome: 'Financeiro', categoria: 'Gestão', ordem: 6 },
  { codigo: 'maquininhas', nome: 'Maquininhas', categoria: 'Gestão', ordem: 7 },
  { codigo: 'bi', nome: 'Relatórios', categoria: 'Gestão', ordem: 8 },
  { codigo: 'marca', nome: 'Marca', categoria: 'Configuração', ordem: 9 },
];

// ============================================================================
// CATÁLOGO DE AÇÕES — a FONTE ÚNICA da verdade de permissões.
//
// Toda ação do sistema (atual e futura) deve estar aqui, no formato
// `modulo.acao`, com um rótulo legível. A partir dele são derivados:
//   - PERMISSOES (mapa modulo -> [codigos])   — usado no backend
//   - TODAS_PERMISSOES (lista achatada)        — validação e template Admin
//   - o EDITOR de papéis                       — renderiza os checkboxes daqui
//
// >>> Para adicionar uma permissão nova (nova função/módulo), basta acrescentar
//     uma linha em `acoes`. Ela aparece AUTOMATICAMENTE no editor de papéis,
//     entra no papel Administrador e fica disponível para gate no backend/front.
//     Não precisa mexer em mais lugar nenhum. <<<
// ============================================================================
const CATALOGO = [
  { modulo: 'entregas', nome: 'Entregas', categoria: 'Operação', acoes: [
    { codigo: 'entregas.ver',           rotulo: 'Ver entregas e acompanhamento', desc: 'Visualizar painel, corridas e acompanhamento' },
    { codigo: 'entregas.criar',         rotulo: 'Lançar corrida',                desc: 'Criar novas entregas' },
    { codigo: 'entregas.editar',        rotulo: 'Editar corrida (endereços)',    desc: 'Alterar endereços e dados da corrida' },
    { codigo: 'entregas.ajustar_valor', rotulo: 'Ajustar valor',                 desc: 'Alterar o valor/preço de uma corrida' },
    { codigo: 'entregas.cancelar',      rotulo: 'Cancelar corrida',              desc: 'Cancelar entregas' },
  ]},
  { modulo: 'motoboys', nome: 'Motoboys', categoria: 'Operação', acoes: [
    { codigo: 'motoboys.ver',       rotulo: 'Ver motoboys',       desc: 'Visualizar a lista de motoboys' },
    { codigo: 'motoboys.gerenciar', rotulo: 'Gerenciar motoboys', desc: 'Cadastrar, editar, ativar/inativar e atribuir' },
  ]},
  { modulo: 'rastreamento', nome: 'Rastreamento', categoria: 'Operação', acoes: [
    { codigo: 'rastreamento.ver', rotulo: 'Ver rastreio e mapa', desc: 'Acompanhar posição dos motoboys em tempo real' },
  ]},
  { modulo: 'filas', nome: 'Filas', categoria: 'Operação', acoes: [
    { codigo: 'filas.ver',       rotulo: 'Ver filas',       desc: 'Visualizar a fila de corridas' },
    { codigo: 'filas.gerenciar', rotulo: 'Gerenciar filas', desc: 'Operar e disparar ofertas' },
  ]},
  { modulo: 'lojas', nome: 'Lojas (Clientes)', categoria: 'Operação', acoes: [
    { codigo: 'lojas.ver',       rotulo: 'Ver lojas/clientes', desc: 'Visualizar os clientes da central' },
    { codigo: 'lojas.gerenciar', rotulo: 'Gerenciar lojas',    desc: 'Criar, editar, configurar e desativar clientes' },
  ]},
  { modulo: 'financeiro', nome: 'Financeiro', categoria: 'Gestão', acoes: [
    { codigo: 'financeiro.ver',       rotulo: 'Ver financeiro',        desc: 'Visualizar faturamento e extratos' },
    { codigo: 'financeiro.sacar',     rotulo: 'Aprovar/realizar saque', desc: 'Operar saques de motoboys' },
    { codigo: 'financeiro.gerenciar', rotulo: 'Gerenciar financeiro',  desc: 'Ajustes, extras e controle financeiro' },
  ]},
  { modulo: 'maquininhas', nome: 'Maquininhas', categoria: 'Gestão', acoes: [
    { codigo: 'maquininhas.ver',       rotulo: 'Ver maquininhas',       desc: '' },
    { codigo: 'maquininhas.gerenciar', rotulo: 'Gerenciar maquininhas', desc: '' },
  ]},
  { modulo: 'bi', nome: 'Relatórios', categoria: 'Gestão', acoes: [
    { codigo: 'bi.ver', rotulo: 'Ver relatórios', desc: 'Acessar relatórios e BI' },
  ]},
  { modulo: 'marca', nome: 'Marca (White-label)', categoria: 'Configuração', acoes: [
    { codigo: 'marca.ver',    rotulo: 'Ver marca',    desc: 'Visualizar a identidade white-label' },
    { codigo: 'marca.editar', rotulo: 'Editar marca', desc: 'Alterar logo, cores e identidade' },
  ]},
  { modulo: 'usuarios', nome: 'Equipe e permissões', categoria: 'Configuração', acoes: [
    { codigo: 'usuarios.ver',       rotulo: 'Ver equipe',                desc: 'Visualizar membros da equipe' },
    { codigo: 'usuarios.gerenciar', rotulo: 'Gerenciar equipe e papéis', desc: 'Criar usuários, papéis e permissões' },
  ]},
];

// Permissões por módulo (derivado do catálogo) — formato modulo.acao.
const PERMISSOES = Object.fromEntries(CATALOGO.map((m) => [m.modulo, m.acoes.map((a) => a.codigo)]));

const TODAS_PERMISSOES = CATALOGO.flatMap((m) => m.acoes.map((a) => a.codigo));

// Módulos habilitados por padrão ao criar um cliente (o master ajusta depois).
const MODULOS_PADRAO = ['entregas', 'motoboys', 'rastreamento', 'filas', 'lojas', 'marca'];

// Papéis-modelo (templates do sistema, empresa_id = NULL). O cliente usa ou clona/cria os seus.
const TEMPLATES = [
  { nome: 'Administrador', descricao: 'Acesso total à operação do cliente', permissoes: TODAS_PERMISSOES },
  {
    nome: 'Operador', descricao: 'Operação de entregas e motoboys (sem financeiro)',
    permissoes: [...PERMISSOES.entregas, ...PERMISSOES.motoboys, ...PERMISSOES.rastreamento, ...PERMISSOES.filas, ...PERMISSOES.lojas, 'bi.ver'],
  },
  {
    nome: 'Financeiro', descricao: 'Financeiro e relatórios',
    permissoes: [...PERMISSOES.financeiro, 'bi.ver', 'entregas.ver', 'rastreamento.ver'],
  },
  {
    nome: 'Loja', descricao: 'Usuário da loja-cliente: cria e acompanha as próprias entregas',
    permissoes: ['entregas.ver', 'entregas.criar', 'rastreamento.ver'],
  },
];

module.exports = { MODULOS, CATALOGO, PERMISSOES, TODAS_PERMISSOES, MODULOS_PADRAO, TEMPLATES };

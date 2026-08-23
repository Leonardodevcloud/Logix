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
// CATÁLOGO DE AÇÕES — FONTE ÚNICA da verdade de permissões (auditável).
//
// Cada micro-ação do sistema tem um código `modulo.acao` e um rótulo legível.
// Dele derivam: PERMISSOES, TODAS_PERMISSOES, os templates e o EDITOR (checkboxes).
//
// >>> PARA ADICIONAR UMA PERMISSÃO NOVA: acrescente uma linha em `acoes`. Ela
//     aparece sozinha no editor, entra no papel Administrador e fica pronta para
//     ser exigida no backend (exigirPermissao) e escondida no front (pode()).
//     É o único lugar a editar. <<<
// ============================================================================
const CATALOGO = [
  { modulo: 'entregas', nome: 'Entregas', categoria: 'Operação', acoes: [
    { codigo: 'entregas.ver',           rotulo: 'Ver entregas e acompanhamento', desc: 'Visualizar painel, corridas, acompanhamento e histórico' },
    { codigo: 'entregas.criar',         rotulo: 'Lançar corrida',                desc: 'Criar novas entregas' },
    { codigo: 'entregas.editar',        rotulo: 'Editar endereços da corrida',   desc: 'Alterar endereços/pontos de uma corrida' },
    { codigo: 'entregas.ajustar_valor', rotulo: 'Ajustar valor',                 desc: 'Alterar o valor cliente/motoboy de uma corrida' },
    { codigo: 'entregas.liberar_ponto', rotulo: 'Liberar/aprovar ponto',         desc: 'Aprovar liberação de ponto de uma corrida' },
    { codigo: 'entregas.finalizar',     rotulo: 'Finalizar manualmente',         desc: 'Concluir uma corrida manualmente pela central' },
    { codigo: 'entregas.reabrir',       rotulo: 'Reabrir corrida',               desc: 'Reabrir uma corrida concluída/cancelada' },
    { codigo: 'entregas.cancelar',      rotulo: 'Cancelar corrida',              desc: 'Cancelar entregas' },
  ]},
  { modulo: 'filas', nome: 'Filas e ofertas', categoria: 'Operação', acoes: [
    { codigo: 'filas.ver',         rotulo: 'Ver filas',            desc: 'Visualizar a fila de corridas e motoboys ativos' },
    { codigo: 'filas.gerenciar',   rotulo: 'Atribuir em lote',     desc: 'Atribuir corridas a motoboys em lote' },
    { codigo: 'filas.disparar',    rotulo: 'Disparar oferta (raio)', desc: 'Ofertar a corrida aos motoboys no raio' },
    { codigo: 'filas.reatribuir',  rotulo: 'Trocar/reatribuir motoboy', desc: 'Reatribuir a corrida a outro motoboy' },
    { codigo: 'filas.desatribuir', rotulo: 'Desatribuir motoboy',  desc: 'Remover o motoboy da corrida' },
  ]},
  { modulo: 'motoboys', nome: 'Motoboys', categoria: 'Operação', acoes: [
    { codigo: 'motoboys.ver',       rotulo: 'Ver motoboys',       desc: 'Visualizar a lista de motoboys' },
    { codigo: 'motoboys.gerenciar', rotulo: 'Gerenciar motoboys', desc: 'Cadastrar, editar, ativar/inativar' },
    { codigo: 'motoboys.atribuir',  rotulo: 'Atribuir motoboy à loja', desc: 'Vincular motoboys a clientes/centros' },
  ]},
  { modulo: 'rastreamento', nome: 'Rastreamento', categoria: 'Operação', acoes: [
    { codigo: 'rastreamento.ver', rotulo: 'Ver rastreio e mapa', desc: 'Acompanhar posição dos motoboys em tempo real' },
  ]},
  { modulo: 'lojas', nome: 'Lojas (Clientes)', categoria: 'Operação', acoes: [
    { codigo: 'lojas.ver',        rotulo: 'Ver lojas/clientes',   desc: 'Visualizar os clientes da central' },
    { codigo: 'lojas.gerenciar',  rotulo: 'Gerenciar lojas',      desc: 'Criar, editar, configurar e desativar clientes' },
    { codigo: 'lojas.enderecos',  rotulo: 'Gerenciar endereços da loja', desc: 'Editar os endereços salvos de um cliente' },
    { codigo: 'lojas.centros',    rotulo: 'Gerenciar centros de custo', desc: 'Criar/editar centros de custo de um cliente' },
  ]},
  { modulo: 'financeiro', nome: 'Financeiro', categoria: 'Gestão', acoes: [
    { codigo: 'financeiro.ver',        rotulo: 'Ver financeiro',         desc: 'Faturamento de clientes e motoboys, extratos' },
    { codigo: 'financeiro.sacar',      rotulo: 'Aprovar/realizar saque', desc: 'Operar saques de motoboys' },
    { codigo: 'financeiro.extras',     rotulo: 'Lançar extras/ajustes',  desc: 'Adicionar bônus, descontos e ajustes' },
    { codigo: 'financeiro.categorias', rotulo: 'Gerenciar categorias/valores', desc: 'Definir tabelas de preço e categorias' },
    { codigo: 'financeiro.gerenciar',  rotulo: 'Gerenciar financeiro',   desc: 'Controle financeiro geral' },
  ]},
  { modulo: 'maquininhas', nome: 'Maquininhas', categoria: 'Gestão', acoes: [
    { codigo: 'maquininhas.ver',       rotulo: 'Ver maquininhas',       desc: '' },
    { codigo: 'maquininhas.gerenciar', rotulo: 'Gerenciar maquininhas', desc: '' },
  ]},
  { modulo: 'bi', nome: 'Relatórios', categoria: 'Gestão', acoes: [
    { codigo: 'bi.ver',       rotulo: 'Ver relatórios',      desc: 'Acessar dashboards e relatórios' },
    { codigo: 'bi.exportar',  rotulo: 'Exportar relatórios',  desc: 'Baixar/exportar dados dos relatórios' },
  ]},
  { modulo: 'marca', nome: 'Marca (White-label)', categoria: 'Configuração', acoes: [
    { codigo: 'marca.ver',    rotulo: 'Ver marca',    desc: 'Visualizar a identidade white-label' },
    { codigo: 'marca.editar', rotulo: 'Editar marca', desc: 'Alterar logo, cores e identidade' },
  ]},
  { modulo: 'usuarios', nome: 'Equipe e permissões', categoria: 'Configuração', acoes: [
    { codigo: 'usuarios.ver',       rotulo: 'Ver equipe',                desc: 'Visualizar membros da equipe' },
    { codigo: 'usuarios.gerenciar', rotulo: 'Gerenciar equipe e permissões', desc: 'Criar usuários e definir permissões' },
  ]},
];

// Derivados (retrocompatível).
const PERMISSOES = Object.fromEntries(CATALOGO.map((m) => [m.modulo, m.acoes.map((a) => a.codigo)]));
const TODAS_PERMISSOES = CATALOGO.flatMap((m) => m.acoes.map((a) => a.codigo));

const MODULOS_PADRAO = ['entregas', 'motoboys', 'rastreamento', 'filas', 'lojas', 'marca'];

// Papéis-modelo (atalhos: aplicam um conjunto de permissões de uma vez no editor).
const TEMPLATES = [
  { nome: 'Administrador', descricao: 'Acesso total à operação', permissoes: TODAS_PERMISSOES },
  {
    nome: 'Operador', descricao: 'Operação de entregas e motoboys (sem financeiro)',
    permissoes: [...PERMISSOES.entregas, ...PERMISSOES.motoboys, ...PERMISSOES.rastreamento, ...PERMISSOES.filas, ...PERMISSOES.lojas, 'bi.ver'],
  },
  {
    nome: 'Financeiro', descricao: 'Financeiro e relatórios',
    permissoes: [...PERMISSOES.financeiro, 'bi.ver', 'bi.exportar', 'entregas.ver', 'rastreamento.ver'],
  },
  {
    nome: 'Loja', descricao: 'Usuário da loja-cliente: cria e acompanha as próprias entregas',
    permissoes: ['entregas.ver', 'entregas.criar', 'rastreamento.ver'],
  },
];

module.exports = { MODULOS, CATALOGO, PERMISSOES, TODAS_PERMISSOES, MODULOS_PADRAO, TEMPLATES };

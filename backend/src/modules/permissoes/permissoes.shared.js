// Catálogo de módulos vendáveis e o conjunto de permissões de cada um.

const MODULOS = [
  { codigo: 'entregas', nome: 'Entregas', categoria: 'Operação', ordem: 1 },
  { codigo: 'motoboys', nome: 'Motoboys', categoria: 'Operação', ordem: 2 },
  { codigo: 'rastreamento', nome: 'Rastreamento', categoria: 'Operação', ordem: 3 },
  { codigo: 'filas', nome: 'Filas', categoria: 'Operação', ordem: 4 },
  { codigo: 'financeiro', nome: 'Financeiro', categoria: 'Gestão', ordem: 5 },
  { codigo: 'maquininhas', nome: 'Maquininhas', categoria: 'Gestão', ordem: 6 },
  { codigo: 'bi', nome: 'Relatórios', categoria: 'Gestão', ordem: 7 },
  { codigo: 'marca', nome: 'Marca', categoria: 'Configuração', ordem: 8 },
];

// Permissões por módulo (formato modulo.acao). 'usuarios' é base (não é um módulo vendável).
const PERMISSOES = {
  entregas: ['entregas.ver', 'entregas.criar', 'entregas.editar', 'entregas.cancelar'],
  motoboys: ['motoboys.ver', 'motoboys.gerenciar'],
  rastreamento: ['rastreamento.ver'],
  filas: ['filas.ver', 'filas.gerenciar'],
  financeiro: ['financeiro.ver', 'financeiro.sacar', 'financeiro.gerenciar'],
  maquininhas: ['maquininhas.ver', 'maquininhas.gerenciar'],
  bi: ['bi.ver'],
  marca: ['marca.ver', 'marca.editar'],
  usuarios: ['usuarios.ver', 'usuarios.gerenciar'],
};

const TODAS_PERMISSOES = Object.values(PERMISSOES).flat();

// Módulos habilitados por padrão ao criar um cliente (o master ajusta depois).
const MODULOS_PADRAO = ['entregas', 'motoboys', 'rastreamento', 'marca'];

// Papéis-modelo (templates do sistema, empresa_id = NULL). O cliente usa ou clona/cria os seus.
const TEMPLATES = [
  { nome: 'Administrador', descricao: 'Acesso total à operação do cliente', permissoes: TODAS_PERMISSOES },
  {
    nome: 'Operador', descricao: 'Operação de entregas e motoboys (sem financeiro)',
    permissoes: [...PERMISSOES.entregas, ...PERMISSOES.motoboys, ...PERMISSOES.rastreamento, ...PERMISSOES.filas, 'bi.ver'],
  },
  {
    nome: 'Financeiro', descricao: 'Financeiro e relatórios',
    permissoes: [...PERMISSOES.financeiro, 'bi.ver', 'entregas.ver', 'rastreamento.ver'],
  },
];

module.exports = { MODULOS, PERMISSOES, TODAS_PERMISSOES, MODULOS_PADRAO, TEMPLATES };

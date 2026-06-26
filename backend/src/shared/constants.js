// Constantes compartilhadas do sistema.

const AUDIT_CATEGORIES = {
  AUTENTICACAO: 'autenticacao',
  IMPERSONACAO: 'impersonacao',
  EMPRESA: 'empresa',
  LOJA: 'loja',
  MOTOBOY: 'motoboy',
  ENTREGA: 'entrega',
  MAQUININHA: 'maquininha',
  FINANCEIRO: 'financeiro',
  MODULO: 'modulo',
  BRANDING: 'branding',
  USUARIO: 'usuario',
};

const ERRO_MSGS = {
  CREDENCIAIS_INVALIDAS: 'E-mail ou senha incorretos',
  TOKEN_AUSENTE: 'Token de acesso ausente',
  TOKEN_INVALIDO: 'Token de acesso inválido ou expirado',
  SEM_PERMISSAO: 'Você não tem permissão para esta ação',
  EMPRESA_NAO_ENCONTRADA: 'Empresa não encontrada',
  MOTOBOY_NAO_ENCONTRADO: 'Motoboy não encontrado',
  ENTREGA_NAO_ENCONTRADA: 'Entrega não encontrada',
};

const PERFIS = {
  SUPER_ADMIN: 'super_admin',   // dono da plataforma (você) — enxerga todas as empresas
  CENTRAL_ADMIN: 'central_admin', // dono da central — opera a empresa inteira
  LOJA: 'loja',                 // usuário da loja-cliente — enxerga só a própria loja
  MOTOBOY: 'motoboy',
  CLIENTE: 'cliente',           // legado: equivale a 'loja' (mantido p/ transição)
};

const STATUS_ENTREGA = {
  AGUARDANDO_ATRIBUICAO: 'aguardando_atribuicao',
  AGUARDANDO_COLETA: 'aguardando_coleta',
  EM_COLETA: 'em_coleta',
  EM_ROTA: 'em_rota',
  ENTREGUE: 'entregue',
  CANCELADA: 'cancelada',
};

const STATUS_PONTO = { PENDENTE: 'pendente', ENTREGUE: 'entregue', FALHA: 'falha' };

module.exports = { AUDIT_CATEGORIES, ERRO_MSGS, PERFIS, STATUS_ENTREGA, STATUS_PONTO };

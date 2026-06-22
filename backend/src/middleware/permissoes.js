const AppError = require('../shared/AppError');
const { PERFIS } = require('../shared/constants');
const { MODULOS } = require('../modules/permissoes/permissoes.shared');
const service = require('../modules/permissoes/permissoes.service');

const CODIGOS = new Set(MODULOS.map((m) => m.codigo));

// Exige que o cliente tenha o módulo contratado. Super admin passa direto.
function exigirModulo(codigo) {
  return async (req, res, next) => {
    try {
      const u = req.usuario;
      if (!u) return next(AppError.naoAutorizado());
      if (u.perfil === PERFIS.SUPER_ADMIN) return next();
      const empresaId = req.empresaId || u.empresaId;
      if (!(await service.empresaTemModulo(empresaId, codigo))) {
        return next(AppError.proibido(`Módulo "${codigo}" não está no plano deste cliente`));
      }
      next();
    } catch (e) { next(e); }
  };
}

// Exige uma permissão específica (modulo.acao) do papel do usuário. Super admin passa direto.
function exigirPermissao(permissao) {
  return async (req, res, next) => {
    try {
      const u = req.usuario;
      if (!u) return next(AppError.naoAutorizado());
      if (u.perfil === PERFIS.SUPER_ADMIN) return next();
      const doPapel = await service.permissoesDoUsuario(u.id);
      if (!doPapel.has(permissao)) return next(AppError.proibido('Sem permissão para esta ação'));
      const codigo = permissao.split('.')[0];
      if (CODIGOS.has(codigo)) {
        const empresaId = req.empresaId || u.empresaId;
        if (!(await service.empresaTemModulo(empresaId, codigo))) {
          return next(AppError.proibido(`Módulo "${codigo}" não está no plano deste cliente`));
        }
      }
      next();
    } catch (e) { next(e); }
  };
}

module.exports = { exigirModulo, exigirPermissao };

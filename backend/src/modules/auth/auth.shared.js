const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL_DIAS = Number(process.env.JWT_REFRESH_TTL_DIAS) || 7;

async function hashSenha(senha) { return bcrypt.hash(senha, 12); }
async function conferirSenha(senha, hash) { return bcrypt.compare(senha, hash); }

function gerarAccessToken(usuario) {
  return jwt.sign(
    { id: usuario.id, perfil: usuario.perfil, empresaId: usuario.empresa_id, lojaId: usuario.loja_id || null, nome: usuario.nome },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

// Refresh token opaco: guardamos só o hash no banco.
function gerarRefreshToken() {
  const bruto = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(bruto).digest('hex');
  const expiraEm = new Date(Date.now() + REFRESH_TTL_DIAS * 86400_000);
  return { bruto, hash, expiraEm };
}
function hashRefresh(bruto) { return crypto.createHash('sha256').update(bruto).digest('hex'); }

// sameSite 'none': o painel (Vercel) e a API (Railway) estão em domínios diferentes.
// path '/': o painel chega pelo BFF da Vercel (/bff/v1/auth/...), então um path
// restrito a /api/v1/auth nunca casaria e o refresh quebraria. Não há risco em
// enviar o cookie para outras rotas: nenhuma rota aceita autenticação por cookie (ADR-003).
const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'none', path: '/' };
const MS_ACCESS = 15 * 60_000;
const MS_REFRESH = REFRESH_TTL_DIAS * 86400_000;

module.exports = {
  hashSenha, conferirSenha, gerarAccessToken, gerarRefreshToken, hashRefresh,
  COOKIE_OPTS, MS_ACCESS, MS_REFRESH, REFRESH_TTL_DIAS,
};

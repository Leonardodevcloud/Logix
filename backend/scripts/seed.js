/* Cria o primeiro usuário super_admin. Idempotente: se o e-mail já existir, não duplica.
   Uso: SEED_ADMIN_EMAIL=... SEED_ADMIN_SENHA=... npm run seed
   (SEED_ADMIN_NOME é opcional) */
require('dotenv').config();
const { query, pool } = require('../src/shared/db');
const { hashSenha } = require('../src/modules/auth/auth.shared');
const { PERFIS } = require('../src/shared/constants');
const empresas = require('../src/modules/empresas');
const auth = require('../src/modules/auth');

async function seed() {
  const nome = process.env.SEED_ADMIN_NOME || 'Super Admin';
  const email = process.env.SEED_ADMIN_EMAIL;
  const senha = process.env.SEED_ADMIN_SENHA;

  if (!email || !senha) {
    console.error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_SENHA no ambiente.');
    process.exit(1);
  }

  // Garante que as tabelas existem (idempotente).
  await empresas.initEmpresasTables();
  await auth.initAuthTables();

  const existe = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existe.rows[0]) {
    console.log('Super admin já existe:', email, '(' + existe.rows[0].id + ')');
    await pool.end();
    return;
  }

  const senhaHash = await hashSenha(senha);
  const { rows } = await query(
    `INSERT INTO usuarios (empresa_id, perfil, nome, email, senha_hash)
     VALUES (NULL, $1, $2, $3, $4) RETURNING id`,
    [PERFIS.SUPER_ADMIN, nome, email, senhaHash]
  );
  console.log('Super admin criado:', email, '(' + rows[0].id + ')');
  await pool.end();
}

seed().catch((e) => { console.error('Falha no seed:', e.message); process.exit(1); });

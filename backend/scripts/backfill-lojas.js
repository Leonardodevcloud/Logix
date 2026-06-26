/* Backfill da estrutura de lojas para empresas/entregas que já existiam
   antes da introdução do nível "loja".

   Para cada empresa:
     1. Habilita o módulo 'lojas' (se ainda não estiver).
     2. Cria uma "Loja Padrão" se a empresa ainda não tem nenhuma loja.
     3. Vincula entregas órfãs (loja_id IS NULL) à loja padrão.
     4. Vincula enderecos_salvos órfãos à loja padrão.
     5. Migra usuários 'cliente'/'loja' sem loja_id para a loja padrão (opcional).

   Idempotente: rodar várias vezes não duplica nada.

   Uso: npm run backfill:lojas
        DRY_RUN=1 npm run backfill:lojas */
try { require('dotenv').config(); } catch {}
const { query, pool } = require('../src/shared/db');

const DRY = process.env.DRY_RUN === '1';

async function backfill() {
  const { rows: empresas } = await query(`SELECT id, razao_social, nome_fantasia FROM empresas ORDER BY criado_em`);
  console.log(`${empresas.length} empresa(s) para processar.${DRY ? ' [DRY-RUN]' : ''}\n`);

  let lojasCriadas = 0, entregasVinculadas = 0, enderecosVinculados = 0, usuariosVinculados = 0, modulosHabilitados = 0;

  for (const emp of empresas) {
    const nomeEmp = emp.nome_fantasia || emp.razao_social;
    console.log(`▸ ${nomeEmp}`);

    // 1. Habilita módulo 'lojas'
    if (!DRY) {
      const r = await query(
        `INSERT INTO empresa_modulos (empresa_id, modulo_codigo, ativo) VALUES ($1, 'lojas', TRUE)
         ON CONFLICT (empresa_id, modulo_codigo) DO UPDATE SET ativo = TRUE`,
        [emp.id]
      );
      if (r.rowCount) modulosHabilitados++;
    }

    // 2. Já tem loja?
    const { rows: lojasExistentes } = await query(
      `SELECT id FROM lojas WHERE empresa_id = $1 ORDER BY criado_em LIMIT 1`, [emp.id]);
    let lojaPadraoId = lojasExistentes[0]?.id;

    if (!lojaPadraoId) {
      console.log(`   cria "Loja Padrão"`);
      if (!DRY) {
        const { rows } = await query(
          `INSERT INTO lojas (empresa_id, nome_fantasia, razao_social)
           VALUES ($1, 'Loja Padrão', $2) RETURNING id`,
          [emp.id, nomeEmp]
        );
        lojaPadraoId = rows[0].id;
      }
      lojasCriadas++;
    } else {
      console.log(`   já tem loja (${lojaPadraoId})`);
    }

    if (!lojaPadraoId) { console.log(''); continue; } // DRY sem loja criada — pula vínculos

    // 3. Vincula entregas órfãs
    if (!DRY) {
      const r = await query(
        `UPDATE entregas SET loja_id = $1 WHERE empresa_id = $2 AND loja_id IS NULL`,
        [lojaPadraoId, emp.id]
      );
      entregasVinculadas += r.rowCount;
      if (r.rowCount) console.log(`   ${r.rowCount} entrega(s) vinculada(s)`);
    } else {
      const { rows } = await query(
        `SELECT count(*)::int AS qtd FROM entregas WHERE empresa_id = $1 AND loja_id IS NULL`, [emp.id]);
      console.log(`   ${rows[0].qtd} entrega(s) seriam vinculadas`);
    }

    // 4. Vincula enderecos_salvos órfãos
    if (!DRY) {
      const r = await query(
        `UPDATE enderecos_salvos SET loja_id = $1 WHERE empresa_id = $2 AND loja_id IS NULL`,
        [lojaPadraoId, emp.id]
      );
      enderecosVinculados += r.rowCount;
      if (r.rowCount) console.log(`   ${r.rowCount} endereço(s) vinculado(s)`);
    }

    // 5. Usuários de loja sem loja_id → loja padrão
    if (!DRY) {
      const r = await query(
        `UPDATE usuarios SET loja_id = $1
         WHERE empresa_id = $2 AND loja_id IS NULL AND perfil IN ('loja','cliente')`,
        [lojaPadraoId, emp.id]
      );
      usuariosVinculados += r.rowCount;
      if (r.rowCount) console.log(`   ${r.rowCount} usuário(s) de loja vinculado(s)`);
    }

    console.log('');
  }

  console.log('─'.repeat(50));
  console.log(`Resumo${DRY ? ' [DRY-RUN, nada gravado]' : ''}:`);
  console.log(`  Módulos 'lojas' habilitados: ${modulosHabilitados}`);
  console.log(`  Lojas padrão criadas: ${lojasCriadas}`);
  console.log(`  Entregas vinculadas: ${entregasVinculadas}`);
  console.log(`  Endereços vinculados: ${enderecosVinculados}`);
  console.log(`  Usuários de loja vinculados: ${usuariosVinculados}`);
}

backfill()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });

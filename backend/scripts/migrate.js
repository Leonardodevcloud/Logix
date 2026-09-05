// Release command: `npm run migrate` (ou `npm run migrate -- down 1` para reverter a última).
require('dotenv').config();
const { rodarMigracoes } = require('../src/shared/migracoes');
const { encerrarPool } = require('../src/shared/db');

const direcao = process.argv[2] === 'down' ? 'down' : 'up';
const quantidade = process.argv[3] ? Number(process.argv[3]) : undefined;

rodarMigracoes({ direcao, quantidade })
  .then(async (r) => { console.log(`[migrate] ${direcao}: ${r.length} migração(ões)`); await encerrarPool(); process.exit(0); })
  .catch(async (e) => { console.error('[migrate] falhou:', e.message); await encerrarPool(); process.exit(1); });

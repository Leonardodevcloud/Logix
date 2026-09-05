/** Fronteiras de módulo impostas por ferramenta (ver ARQUITETURA.md §3).
 *  Regras:
 *   1. Um módulo só importa OUTRO módulo pelo index.js dele (API pública) — nunca
 *      pelo service/routes/migration interno.
 *   2. shared/ e middleware/ nunca importam módulos (dependência é sempre módulo → shared).
 *   3. Sem ciclos entre módulos.
 *   4. realtime/, jobs/ e integracoes/ são infraestrutura: módulos podem usá-los,
 *      eles não podem depender de módulos (exceção: jobs orquestra módulos, é o "worker").
 *  Rodar: npm run deps:check  (falha no CI se violar).
 */
module.exports = {
  forbidden: [
    {
      name: 'modulo-importa-interno-de-outro-modulo',
      severity: 'error',
      comment: 'Importe pelo index.js do módulo (API pública). Se precisa de algo interno, exponha no index.',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/(?!index\\.js$).+', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'shared-nao-importa-modulos',
      severity: 'error',
      from: { path: '^src/(shared|middleware)/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'realtime-integracoes-nao-importam-modulos',
      severity: 'error',
      from: { path: '^src/(realtime|integracoes)/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'sem-ciclos-entre-modulos',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { circular: true, viaOnly: { path: '^src/modules/' } },
    },
    {
      name: 'nao-importa-console-em-src',
      severity: 'info',
      comment: 'informativo — no-console do eslint cobre',
      from: {}, to: { path: '^$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: 'node_modules|test/|scripts/' },
    tsPreCompilationDeps: false,
    reporterOptions: { text: { highlightFocused: true } },
  },
};

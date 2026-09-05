# Logix — Arquitetura

> Este documento é a fonte de verdade sobre **como o sistema é organizado e por quê**.
> Todo dev lê no primeiro dia. Toda decisão relevante vira um ADR na seção 8.
> Notas específicas do multi-tenant (hierarquia, perfis, white-label) estão em `ARQUITETURA-MULTITENANT.md`.

---

## 1. Em uma frase

**Monólito modular multi-tenant, sem estado no processo, organizado por domínio de negócio, com fronteiras entre módulos impostas por ferramenta e comunicação entre módulos por API pública (`index.js`) e eventos de domínio.**

Não é microserviços. Não vai ser microserviços por padrão. A seção 7 diz exatamente quando e como um módulo vira serviço próprio.

## 2. Visão geral

```
┌──────────────────────────────────────────────────────────────────────────┐
│  BORDA                                                                    │
│  Vercel (painel SPA + BFF /bff → API)   ·   app Expo (repo appboylogix)  │
│  ERPs dos clientes → /api/v1/integracao (chave por cliente)              │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ HTTPS · Bearer JWT (painel/app) · cookie httpOnly só p/ refresh
┌──────────────▼───────────────────────────────────────────────────────────┐
│  API  (N réplicas idênticas · SEM estado em memória)                      │
│  Express · middlewares transversais · 22 módulos de domínio               │
│  WebSocket /ws (salas por empresa/motoboy)                                │
└───────┬──────────────┬─────────────────┬─────────────────────────────────┘
        │              │                 │
┌───────▼──────┐ ┌─────▼──────┐  ┌───────▼──────────────────────────────────┐
│ PostgreSQL   │ │ Redis      │  │ WORKER (opcional)                         │
│ shared-schema│ │ pub/sub WS │  │ cron · webhooks · fechamento · limpeza    │
│ empresa_id   │ │ rate-limit │  │ (todo job com advisory lock: N processos  │
│ em toda tab. │ │ cache      │  │  podem rodar, só um executa)              │
└──────────────┘ └────────────┘  └───────────────────────────────────────────┘
                 Redis opcional: sem REDIS_URL o sistema roda em modo 1 réplica.
Externos: ORS/heigit (rotas, geocoding) · Google Maps · Expo Push · S3/R2 (fotos) · Sentry
```

## 3. Estrutura do backend e regras de fronteira

```
backend/
├── server.js            ← SÓ wiring: monta middlewares, migra, sobe HTTP/WS. Zero regra de negócio.
├── worker.js            ← processo dos jobs (cron). Mesmas env vars da API.
└── src/
    ├── shared/          ← infra transversal: db, logger, contexto (ALS), AppError, storage, push, schemas
    ├── middleware/      ← auth, tenant, permissões, rateLimit, validar (zod), errorHandler, requestLogger
    ├── realtime/ws.js   ← WebSocket (salas). Não conhece módulos.
    ├── integracoes/     ← clientes de APIs externas (ORS). Não conhecem módulos.
    ├── jobs/cron.js     ← orquestra jobs chamando a API pública dos módulos
    └── modules/<nome>/
        ├── index.js            ← API PÚBLICA do módulo: exporta initXRoutes, initXTables e funções que outros módulos podem usar
        ├── <nome>.migration.js ← DDL idempotente (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
        ├── <nome>.routes.js    ← HTTP: valida (zod), resolve tenant, chama service. Sem SQL.
        ├── <nome>.service.js   ← regra de negócio + SQL do módulo
        ├── <nome>.shared.js    ← helpers puros do módulo
        └── routes/             ← sub-routers quando > 10 endpoints
```

### Regras (verificadas por `npm run deps:check` — falha o CI)

| # | Regra | Por quê |
|---|---|---|
| R1 | Um módulo só importa **outro módulo pelo `index.js`** dele. Nunca `../filas/filas.service`. | O `index.js` é o contrato. O que não está lá é detalhe interno e pode mudar sem avisar ninguém. |
| R2 | `shared/`, `middleware/`, `realtime/`, `integracoes/` **nunca importam `modules/`**. | A dependência aponta sempre módulo → infra. Infra que conhece domínio vira acoplamento invisível. |
| R3 | **Sem ciclos** entre módulos. | Ciclo = os dois módulos são um só. Ou funde, ou extrai a parte comum para um terceiro. |
| R4 | Cada módulo é **dono das suas tabelas**. Outro módulo não faz `SELECT` nelas; pede uma função no `index.js`. | Sem isso não dá para mudar schema, adicionar cache ou extrair o módulo. |
| R5 | Efeitos colaterais em outro módulo saem como **evento de domínio**, não chamada direta (ver §5). | `entregas` não deve saber que `score` existe. |
| R6 | Toda rota que grava dado tem **schema zod** (`middleware/validar.js` + `shared/schemas.js`). | Entrada é a única coisa que não controlamos. |
| R7 | Toda query em tabela com `empresa_id` **filtra por `empresa_id`**. Sem exceção, inclusive quando o id do recurso vem da URL. | Isolamento de tenant é a promessa central do produto. |
| R8 | Nenhum `console.*` em `src/`. Só `shared/logger` (pino). | Log sem `reqId`/`empresaId` é log que ninguém consegue usar em produção. |

**Estado atual das regras:** R1–R3 estão ativas com **baseline de 28 violações conhecidas** em `backend/.dependency-cruiser-known-violations.json` (dívida registrada em 2026-09; eram 31, 3 pagas na Sprint 2 via eventos). O CI falha em violação **nova**; as antigas são pagas conforme os módulos forem tocados. Para ver a dívida: `npm run deps:divida`. Ao pagar uma, rode `npm run deps:baseline` e commite o JSON.

## 4. Fluxo de uma requisição

```
requestLogger  → gera X-Request-Id, abre contexto (ALS) com reqId
compression · helmet · cors (lista explícita) · json · cookies · sanitizer
[rate limit]
verificarToken → req.usuario (Bearer JWT). Cookie NÃO autentica (ADR-003)
resolverTenant → req.empresaId / req.lojaId conforme perfil; setEmpresa(ALS)
exigirModulo / exigirPermissao → plano da empresa e papel do usuário
validar(schema) → req.body coerido e limpo
handler → service → db (SEMPRE $1,$2 · SEMPRE empresa_id)
errorHandler → AppError → status dela · PG conhecido → 409/422 · resto → 500 + Sentry + reqId
```

Tudo dentro do handler enxerga `reqId`, `empresaId` e `usuarioId` pelo `AsyncLocalStorage` (`shared/contexto.js`) — o logger injeta sozinho, as integrações externas usam para contabilizar custo por empresa (`apiuso`).

## 5. Comunicação entre módulos

**Implementado (Sprint 2):** barramento de eventos de domínio em `shared/eventos.js`. Cada módulo registra seus ouvintes em `registrarOuvintes()` no próprio `index.js`; `src/app.js` chama todos no boot.

```js
// no módulo que causa o fato
eventos.emitir('entrega.concluida', { empresaId, entregaId, motoboyId, em });

// nos módulos interessados (registram no próprio index.js)
eventos.ouvir('entrega.concluida', async (e) => scoreService.pontuar(e));
```

Regras: nome `<agregado>.<fato-no-passado>`; payload só com ids e dados imutáveis (quem precisa de mais consulta); handler nunca lança (loga e segue); handler é idempotente (o mesmo evento pode chegar duas vezes).

Implementação: `EventEmitter` in-process (o processo que causa o fato trata os ouvintes). Para extrair um módulo, o mesmo `emitir/ouvir` passa a publicar em Redis Streams — **nenhum módulo muda**. Essa é a fronteira que vira fila (§7).

Catálogo em uso: `oferta.aceita`, `oferta.recusada`, `entrega.ponto_concluido`, `entrega.concluida` (ouvintes: score, chat). Próximos: `entrega.criada`, `entrega.atribuida`, `entrega.cancelada`, `motoboy.online_alterado`, `financeiro.fechado`.

## 6. Multi-tenancy e dados

- **Shared database, shared schema.** `empresa_id UUID NOT NULL` em toda tabela de negócio; `loja_id` no segundo nível.
- Escopo resolvido em `middleware/tenant.js`; nunca confie em `empresa_id` vindo do body.
- **Próxima trava (Sprint 2):** Row-Level Security no Postgres (`SET app.empresa_id` por transação + policy por tabela). É a segunda camada: se um dev esquecer o `WHERE`, o banco barra.
- Se um cliente exigir banco dedicado por contrato: `DATABASE_URL` resolvido por tenant no `contexto.js`. A arquitetura permite; não fazemos por padrão.
- **GPS (módulo `posicoes`, dono do dado):** `rastreamento` particionada por dia (`PARTITION BY RANGE (capturado_em)`, partições `rastreamento_YYYYMMDD` + `rastreamento_default`); retenção = `DROP` da partição (cron diário, `manterParticoes`). "Posição atual" vem de `motoboy_posicao_atual` (1 linha por motoboy, UPSERT que nunca regride no tempo) — **tabela publicada**: outros módulos podem lê-la em JOIN, só `posicoes` escreve. Histórico só é lido para trajeto de entrega e janela do radar (índice `(entrega_id, capturado_em)`).
- **Concorrência entre processos:** ondas de oferta com `FOR UPDATE SKIP LOCKED`; todo job do cron com `pg_try_advisory_lock` (`shared/locks.js`). Testado com 3 execuções paralelas (test/integracao/concorrencia).
- **Migrations em duas camadas:** (1) *baseline* idempotente no boot dos módulos (`CREATE IF NOT EXISTS`, congelada — não recebe mais mudanças); (2) **versionadas** em `backend/migrations/` (node-pg-migrate, tabela `pgmigrations`, com `up`/`down`), executadas no pre-deploy (`railway.json`) e repetidas no boot sob `pg_advisory_lock` como rede de segurança. Regra: toda mudança de schema nova é um arquivo em `migrations/`. O CI aplica as migrations e sobe a API em banco **vazio**.

## 7. Quando (e como) um módulo vira serviço próprio

Um módulo só é extraído se **pelo menos dois** forem verdadeiros:

1. **Perfil de escala diferente** — precisa de muito mais réplicas/CPU/memória que o resto (ex.: ingestão de GPS).
2. **Cadência de deploy diferente** — um time quer publicar 10× por dia sem afetar o resto.
3. **Runtime diferente** — precisa de linguagem/lib que não cabe no Node (ex.: roteirização pesada).
4. **Isolamento de falha** — se cair, o resto tem que continuar (ex.: chat).

"Vai crescer" e "tem mais dev" **não** são critérios. Time cresce → mais módulos, mais donos, regras R1–R8 mais rígidas. Não → mais serviços.

**Candidatos, em ordem:** `posicoes` (GPS; critérios 1 e 4 — já isolado como módulo, único escritor das suas tabelas) → `roteirizador` (1 e 3) → `chat` (4). Nenhum outro está no radar.

**Como extrair (strangler):** o módulo já fala com o resto por `index.js` + eventos e é dono das suas tabelas (R1, R4, R5). Extração = mover a pasta para um processo, trocar `eventos` in-process por Redis Streams, expor as funções do `index.js` como HTTP interno. Semanas, não meses — **se as regras estiverem sendo cumpridas.** É por isso que elas existem.

## 8. ADRs — decisões registradas

Formato: contexto → decisão → consequências. Não se apaga ADR; se mudar, escreve outro que supersede.

### ADR-001 · Monólito modular, não microserviços (2026-09)
**Contexto:** SaaS B2B com 1 dev, domínio em evolução, clientes grandes entrando.
**Decisão:** monólito modular com fronteiras impostas por CI (§3) e critérios objetivos de extração (§7).
**Consequências:** deploy único, transações ACID entre módulos, onboarding simples. Custo: disciplina de fronteira precisa ser automatizada (dependency-cruiser), senão vira "big ball of mud".

### ADR-002 · API sem estado; Redis para tudo que é compartilhado (2026-09)
**Contexto:** WS, rate-limit, cache e timers vivem em memória → 1 réplica.
**Decisão:** nenhum estado compartilhado em memória de processo. Redis para pub/sub, rate-limit e cache; worker separado para jobs; `FOR UPDATE SKIP LOCKED` / `pg_advisory_lock` onde N processos concorrem.
**Consequências:** escala horizontal trivial; dependência nova (Redis, opcional — sem ela o sistema cai para modo 1 réplica automaticamente). Implementado na Sprint 2: `shared/redis.js`, `shared/cache.js`, `middleware/rateLimit.js` (store Redis), `realtime/ws.js` (pub/sub com id de instância para não duplicar entrega local).

### ADR-003 · Access token só em Bearer; cookie apenas para refresh (2026-09)
**Contexto:** cookie `lx_access` com `sameSite=none` autenticava rotas de negócio; middleware CSRF existia mas nunca foi aplicado.
**Decisão:** access token vai no corpo e o cliente envia como `Authorization: Bearer`. Cookie httpOnly `lx_refresh` com `path=/api/v1/auth` só serve `/refresh` e `/logout`. Middleware `csrf.js` removido.
**Consequências:** superfície CSRF desaparece (nenhuma rota de negócio aceita cookie). Painel já funcionava assim (renova pelo refresh após reload). Rotação de refresh continua (reuso = 401).

### ADR-004 · Observabilidade: pino + reqId + Sentry (2026-09)
**Decisão:** log JSON estruturado com `reqId`/`empresaId`/`usuarioId` automáticos via ALS; `X-Request-Id` devolvido em toda resposta e no corpo de erros; Sentry opcional por `SENTRY_DSN`; health `/live` e `/ready`; graceful shutdown em SIGTERM.
**Consequências:** suporte pede o `reqId` ao cliente e encontra o log exato. Próximo: métricas Prometheus (`/metrics`) e OpenTelemetry.

### ADR-005 · CORS explícito, negado por padrão (2026-09)
**Contexto:** sem `CORS_ORIGIN`, a API refletia qualquer origem com credentials.
**Decisão:** só origens listadas; sem `Origin` (app nativo, server-to-server) passa; `localhost` só fora de produção.

### ADR-007 · Eventos de domínio in-process, locks no Postgres (2026-09)
**Contexto:** score/chat eram chamados direto de filas/entregas com `try/catch` espalhado; jobs usavam flags em memória contra sobreposição.
**Decisão:** `shared/eventos.js` (EventEmitter) para efeitos colaterais entre módulos; `shared/locks.js` (advisory lock) e `SKIP LOCKED` para exclusão mútua entre processos. Não adotar fila externa (BullMQ/Kafka) até haver um consumidor fora do processo.
**Consequências:** módulos desacoplados sem infraestrutura nova; cron seguro em N réplicas; a troca para Redis Streams fica localizada em `eventos.js`.

### ADR-008 · `src/app.js` separado de `server.js` (2026-09)
**Decisão:** aplicação Express (middlewares, módulos, migrations) em `src/app.js`; processo (porta, WS, Redis, sinais) em `server.js`.
**Consequências:** testes de integração sobem o app com supertest sem porta nem WS; o CI roda isolamento de tenant e concorrência contra Postgres+Redis reais.

### ADR-009 · GPS: módulo `posicoes`, posição atual separada do histórico, histórico particionado (2026-09)
**Contexto:** 11 pontos do código faziam `ORDER BY capturado_em DESC LIMIT 1` sobre o histórico; retenção era `DELETE` em tabela que cresce milhões de linhas/dia.
**Decisão:** módulo `posicoes` é o único escritor de GPS. `motoboy_posicao_atual` (UPSERT, `WHERE EXCLUDED.capturado_em >= atual`) serve toda leitura de "onde está". `rastreamento` particionada por dia; retenção por `DROP`. Ingestão em lote (`/app/posicoes`, ≤20 pontos).
**Consequências:** leitura do mapa é 1 index scan por motoboy independente do tamanho do histórico; retenção sem bloat; 4× menos requests quando o app adotar o lote. Custo: 1 transação com 2 statements por ping.

### ADR-010 · Migrations versionadas com node-pg-migrate (2026-09)
**Decisão:** ver §6. Baseline de boot congelada; novas mudanças só em `migrations/` com `down` obrigatório; `railway.json` executa `npm run migrate` no pre-deploy.
**Consequências:** rollback de schema documentado e testado; CI valida `up` em banco vazio.

### ADR-011 · Arquivos por upload direto ao storage (URL pré-assinada) (2026-09)
**Contexto:** fotos/documentos chegavam em base64 pela API (`limit: '15mb'` global); fotos de protocolo eram gravadas em base64 **dentro do Postgres**.
**Decisão:** módulo `uploads` emite URL assinada de PUT; cliente envia direto ao R2; rota de negócio recebe só a `storage_key` e confirma (prefixo da empresa + HEAD + tamanho). Base64 legado é aceito por compatibilidade, mas vai para o storage — nunca para o banco. Body JSON global = 1 MB.
**Consequências:** API sem tráfego de bytes de arquivo; Postgres para de inchar; chaves auditáveis por empresa/finalidade. Custo: CORS no bucket precisa listar os domínios do painel; clientes precisam de 2 chamadas (URL + PUT) em vez de 1.

### ADR-006 · Validação de entrada com zod (2026-09)
**Decisão:** `validar(schema)` por rota; schemas em `shared/schemas.js`. Substitui `validators.js` e o sanitizer global (que será removido quando todas as rotas de escrita tiverem schema).

## 9. Ferramentas e comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API com reload (`node --watch`) — `\| npx pino-pretty` para log legível |
| `npm run lint` | ESLint (erros reais, `no-console` em `src/`) |
| `npm run deps:check` | Fronteiras de módulo (falha em violação nova) |
| `npm run deps:divida` | Lista as violações conhecidas (baseline) |
| `npm test` | Testes (vitest). Unitários sempre; integração só com `DATABASE_URL_TEST` definida |
| `npm run test:integracao` | Só integração (Postgres real; Redis se `REDIS_URL`) |
| `npm run check` | lint + deps + test (o que o CI roda) |
| `npm run smoke` | Cadeia principal contra uma API viva |
| `npm run migrate` / `migrate:down` | Migrations versionadas (pre-deploy no Railway) |

CI (`.github/workflows/ci.yml`): lint → fronteiras → `npm audit` → testes → **boot em Postgres vazio + seed + smoke**.

## 10. Roadmap de arquitetura

| Sprint | Entrega | Status |
|---|---|---|
| 1 | Observabilidade (pino, reqId, Sentry, health, shutdown) · CORS · ADR-003 · zod nas rotas críticas · CI · testes base · boot em banco vazio | **feito** |
| 2A/2B | Redis opcional (WS pub/sub, rate-limit, cache) · `SKIP LOCKED` nas ondas · advisory locks no cron · barramento de eventos (score, chat) · `src/app.js` · testes de integração com Postgres+Redis no CI | **feito** |
| 3 | módulo `posicoes` · `motoboy_posicao_atual` · `rastreamento` particionada · GPS em lote · migrations versionadas · `/metrics` Prometheus | **feito** |
| 3b | App: GPS em lote com buffer offline (OTA) · backend de upload direto (módulo `uploads`) · correção de autorização no `concluir` | **feito** |
| 3c | Clientes do upload direto (app: conclusão, cadastro, documentos, chat; painel: motoboy-novo, chat, logo) · Grafana + alertas · remover `rastreamento_legado` | próximo |
| 2C | Row-Level Security (depois que testes de integração cobrirem mais rotas) | |
| 4 | OpenAPI da API pública · OpenTelemetry · rotação de segredos (`kid`) · docs DR/LGPD | |

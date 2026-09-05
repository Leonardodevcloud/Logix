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
│ PostgreSQL   │ │ Redis*     │  │ WORKER (1 instância)                      │
│ shared-schema│ │ pub/sub WS │  │ cron · ondas de oferta · webhooks ·       │
│ empresa_id   │ │ rate-limit │  │ fechamento financeiro · push · limpeza    │
│ em toda tab. │ │ cache      │  └───────────────────────────────────────────┘
└──────────────┘ └────────────┘   * Redis: em adoção (Sprint 2). Hoje esses
                                    três itens vivem em memória → 1 réplica.
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

**Estado atual das regras:** R1–R3 estão ativas com **baseline de 31 violações conhecidas** em `backend/.dependency-cruiser-known-violations.json` (dívida registrada em 2026-09). O CI falha em violação **nova**; as antigas são pagas conforme os módulos forem tocados. Para ver a dívida: `npm run deps:divida`. Ao pagar uma, rode `npm run deps:baseline` e commite o JSON.

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

**Hoje:** chamada direta via `index.js` (síncrono) e alguns *fire-and-forget* com `try/catch` (score, push, ws).

**Alvo (Sprint 2):** barramento de eventos de domínio em `shared/eventos.js`:

```js
// no módulo que causa o fato
eventos.emitir('entrega.concluida', { empresaId, entregaId, motoboyId, em });

// nos módulos interessados (registram no próprio index.js)
eventos.ouvir('entrega.concluida', async (e) => scoreService.pontuar(e));
```

Regras: nome `<agregado>.<fato-no-passado>`; payload só com ids e dados imutáveis (quem precisa de mais consulta); handler nunca lança (loga e segue); handler é idempotente (o mesmo evento pode chegar duas vezes).

Implementação inicial: `EventEmitter` in-process. Quando houver Redis, o mesmo `emitir/ouvir` publica em Redis Streams — **nenhum módulo muda**. Essa é a fronteira que vira fila quando um módulo for extraído (§7).

Catálogo inicial: `entrega.criada`, `entrega.atribuida`, `entrega.status_alterado`, `entrega.concluida`, `entrega.cancelada`, `oferta.aceita`, `motoboy.posicao`, `motoboy.online_alterado`, `chat.mensagem`, `financeiro.fechado`.

## 6. Multi-tenancy e dados

- **Shared database, shared schema.** `empresa_id UUID NOT NULL` em toda tabela de negócio; `loja_id` no segundo nível.
- Escopo resolvido em `middleware/tenant.js`; nunca confie em `empresa_id` vindo do body.
- **Próxima trava (Sprint 2):** Row-Level Security no Postgres (`SET app.empresa_id` por transação + policy por tabela). É a segunda camada: se um dev esquecer o `WHERE`, o banco barra.
- Se um cliente exigir banco dedicado por contrato: `DATABASE_URL` resolvido por tenant no `contexto.js`. A arquitetura permite; não fazemos por padrão.
- **Dados de alto volume** (`rastreamento`): particionar por dia (`PARTITION BY RANGE (capturado_em)`), retenção via `DROP PARTITION`; leitura de "posição atual" vem de `motoboy_posicao_atual` (1 linha por motoboy, UPSERT), nunca do histórico.
- **Migrations:** hoje idempotentes no boot, protegidas por `pg_advisory_lock` (uma réplica migra, as outras esperam). O CI sobe a API em banco **vazio** para garantir que um ambiente novo sempre nasce. Alvo: migrations versionadas (`node-pg-migrate`) como *release command*.

## 7. Quando (e como) um módulo vira serviço próprio

Um módulo só é extraído se **pelo menos dois** forem verdadeiros:

1. **Perfil de escala diferente** — precisa de muito mais réplicas/CPU/memória que o resto (ex.: ingestão de GPS).
2. **Cadência de deploy diferente** — um time quer publicar 10× por dia sem afetar o resto.
3. **Runtime diferente** — precisa de linguagem/lib que não cabe no Node (ex.: roteirização pesada).
4. **Isolamento de falha** — se cair, o resto tem que continuar (ex.: chat).

"Vai crescer" e "tem mais dev" **não** são critérios. Time cresce → mais módulos, mais donos, regras R1–R8 mais rígidas. Não → mais serviços.

**Candidatos, em ordem:** `gps-ingest` (critérios 1 e 4) → `roteirizador` (1 e 3) → `chat` (4). Nenhum outro está no radar.

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
**Consequências:** escala horizontal trivial; dependência nova (Redis). Migração em Sprint 2.

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

### ADR-006 · Validação de entrada com zod (2026-09)
**Decisão:** `validar(schema)` por rota; schemas em `shared/schemas.js`. Substitui `validators.js` e o sanitizer global (que será removido quando todas as rotas de escrita tiverem schema).

## 9. Ferramentas e comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API com reload (`node --watch`) — `\| npx pino-pretty` para log legível |
| `npm run lint` | ESLint (erros reais, `no-console` em `src/`) |
| `npm run deps:check` | Fronteiras de módulo (falha em violação nova) |
| `npm run deps:divida` | Lista as violações conhecidas (baseline) |
| `npm test` | Testes (vitest) — tenant, auth, schemas, errorHandler |
| `npm run check` | lint + deps + test (o que o CI roda) |
| `npm run smoke` | Cadeia principal contra uma API viva |

CI (`.github/workflows/ci.yml`): lint → fronteiras → `npm audit` → testes → **boot em Postgres vazio + seed + smoke**.

## 10. Roadmap de arquitetura

| Sprint | Entrega | Status |
|---|---|---|
| 1 | Observabilidade (pino, reqId, Sentry, health, shutdown) · CORS · ADR-003 · zod nas rotas críticas · CI · testes base · boot em banco vazio | **feito** |
| 2 | Redis (WS pub/sub, rate-limit, cache) · worker padrão · `SKIP LOCKED` nas ondas · barramento de eventos · RLS · migrations versionadas · testes de isolamento com banco | próximo |
| 3 | `motoboy_posicao_atual` · particionamento de `rastreamento` · GPS em lote · upload direto S3 · `/metrics` + Grafana + alertas | |
| 4 | OpenAPI da API pública · OpenTelemetry · rotação de segredos (`kid`) · docs DR/LGPD | |

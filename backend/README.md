# Logix · Backend

API multiempresa de gestão de entregas — **Logix — Inteligência em cada rota**.
Node.js + Express + PostgreSQL (Neon), arquitetura modular.

## Rodar localmente

```bash
cp .env.example .env   # preencha DATABASE_URL, JWT_ACCESS_SECRET, ORS_API_KEY
npm install
npm start              # API em http://localhost:3000
npm run worker         # cron jobs (processo separado)
```

As migrations rodam automaticamente no boot (`server.js → migrar()`), na ordem correta de FKs.

## Estrutura

- `server.js` — orchestrator/wiring (sem lógica de negócio)
- `worker.js` — cron jobs (node-cron)
- `src/middleware/` — auth, tenant, csrf, rate limit, helmet, cache, sanitizer, webhook, logger, errorHandler
- `src/shared/` — db, AppError, constants (AUDIT_CATEGORIES/ERRO_MSGS), auditLogger, validators, httpRequest
- `src/realtime/ws.js` — WebSocket (rastreamento, eventos de entrega)
- `src/integracoes/` — OpenRouteService (geocoding + otimização)
- `src/modules/` — auth · empresas · motoboys · entregas (cada módulo: index + migration + routes + service + shared)

## Padrões

- Toda query parametrizada (`$1, $2`), nunca concatenação.
- Erros via `AppError` com status HTTP correto.
- Auditoria via `registrarAuditoria()` + `AUDIT_CATEGORIES`.
- JWT dual-token (access curto + refresh httpOnly com rotação).
- Isolamento multi-tenant por `empresa_id` (middleware `tenant`).

## Rotas principais (`/api/v1`)

| Método | Rota | Perfil |
|---|---|---|
| POST | `/auth/login` · `/refresh` · `/logout` | público |
| POST | `/auth/impersonar/:usuarioId` | super_admin |
| GET/POST/PUT | `/empresas` · `/empresas/cep/:cep` | super_admin |
| GET/POST/PUT/PATCH | `/motoboys` | tenant |
| POST/GET | `/entregas` · `/entregas/concluidas` | tenant |
| GET | `/entregas/:id/acompanhar` | tenant |
| POST | `/entregas/:id/posicao` | tenant (app) |
| POST | `/entregas/:id/pontos/:pid/protocolo` | tenant (app) |

## Próximos módulos

`maquininhas`, `modulos` (permissões), `filas`, `financeiro` (saques), `integracoes` (tokens + webhooks) — seguem o mesmo padrão.

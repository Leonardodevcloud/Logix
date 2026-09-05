# Sprint 3 — GPS em escala: o que muda no deploy

## O que entra
- **Migrations versionadas** (`backend/migrations/`, node-pg-migrate). Rodam como *pre-deploy
  command* (`railway.json` → `npm run migrate`) e também no boot como rede de segurança.
- **`motoboy_posicao_atual`** — 1 linha por motoboy. Mapa, rastreio, radar, filas e integrações
  leem daqui. Backfill automático a partir do histórico.
- **`rastreamento` particionada por dia**. Retenção = `DROP` da partição (instantâneo).
  A tabela antiga fica como `rastreamento_legado` (remover na próxima sprint após validar).
- **`POST /motoboys/app/posicoes`** (lote até 20 pontos). O app adota via OTA depois.
- **`/metrics`** (Prometheus) protegido por `METRICS_TOKEN`.

## Antes do push — verifique o tamanho de rastreamento
No Railway → Postgres → Query (ou psql):
```sql
SELECT count(*), pg_size_pretty(pg_total_relation_size('rastreamento')) FROM rastreamento;
```
- **< 5 milhões de linhas**: siga normalmente. A migração copia tudo numa transação
  (bloqueia escritas em `rastreamento` por alguns segundos; o app do motoboy retenta).
- **≥ 5 milhões**: NÃO rode a migração direto. Me avise — a alternativa é copiar em lotes
  por dia em background e trocar no final (sem bloqueio longo).

Sugestão: faça o deploy em horário de baixo movimento (madrugada).

## Railway
1. Variables da API: `METRICS_TOKEN` = uma string longa aleatória (gere:
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).
   Sem ela, `/metrics` responde 404 (seguro por padrão).
2. O `railway.json` passa a controlar: pre-deploy `npm run migrate`, healthcheck `/health/ready`.
   Se você tinha healthcheck manual em Settings, pode deixar — o arquivo prevalece.
3. Push. No log do deploy, ANTES do container subir, aparece o pre-deploy com
   `migrations versionadas: 2 aplicada(s)`. No boot: `nada pendente` e `partições de rastreamento mantidas`.

## Conferência pós-deploy
```sql
SELECT relkind FROM pg_class WHERE relname = 'rastreamento';          -- 'p' (particionada)
SELECT count(*) FROM motoboy_posicao_atual;                            -- ~nº de motoboys com GPS
SELECT tableoid::regclass, count(*) FROM rastreamento GROUP BY 1 ORDER BY 1 DESC LIMIT 5;
```
Painel: mapa com motoboy online atualizando (agora lê `motoboy_posicao_atual`).

## Rollback
```
cd backend ; npm run migrate:down ; npm run migrate:down     # desfaz 0002 e 0001
```
O `down` de 0002 devolve os dados novos para a tabela antiga e a renomeia de volta.
Depois `git revert` do commit e push.

## Grafana (opcional, 10 min)
Grafana Cloud free → Connections → Prometheus → "Scrape metrics" com URL
`https://<api>.up.railway.app/metrics` e header `Authorization: Bearer <METRICS_TOKEN>`.
Painéis úteis: `logix_http_duracao_segundos` (p95 por rota), `rate(logix_gps_pontos_total[1m])`,
`logix_ws_conexoes`, `logix_pg_pool`, `logix_ofertas_abertas`.

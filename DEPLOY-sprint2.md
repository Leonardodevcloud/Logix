# Sprint 2 (A+B) — o que muda no deploy

## Antes do push
Nada obrigatório. Sem `REDIS_URL` a API roda exatamente como antes (modo 1 réplica).

## Railway — Redis (para 2+ réplicas)
1. No projeto: **+ New → Database → Redis**.
2. No serviço da API → Variables: `REDIS_URL` = `${{Redis.REDIS_URL}}` (URL privada, mesma rede).
3. Redeploy. No log deve aparecer `"msg":"redis pronto"` e `"msg":"ws pub/sub entre réplicas ativo"`.
4. Confira em `/health/ready` — continua `ok:true`. O rate-limit agora sobrevive a reinícios da API (é Redis).

## Railway — réplicas
Settings → **Replicas = 2** só DEPOIS do passo anterior. Sem Redis, 2 réplicas quebram o tempo real
(o painel numa réplica não vê o GPS que entrou na outra).

## Railway — worker (opcional, não urgente)
Todo job do cron roda com advisory lock: com 2 réplicas e `WORKER_EMBUTIDO=true`, só uma executa
cada job. O worker separado serve para tirar carga da API, não para evitar duplicidade.
Quando quiser: **+ New → GitHub Repo (mesmo repo)** → Root Directory `/backend` →
Start Command `node worker.js` → mesmas variáveis → e nas réplicas da API `WORKER_EMBUTIDO=false`.

## Rollback
`git revert` do commit. Nenhuma migration de schema nesta sprint; Redis pode ficar ligado sem efeito.

## Removido nesta sprint
- `backend/src/middleware/cache.js` (middleware `cacheRota` nunca usado; o cache do ORS agora é `shared/cache.js`).

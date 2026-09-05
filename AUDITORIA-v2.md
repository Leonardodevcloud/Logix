# Logix — Auditoria de Arquitetura v2 (antes → depois)

> Referência: `logix-auditoria-arquitetura-v1.md` (setembro/2026, antes das sprints).
> Este documento é o que se apresenta: o que foi encontrado, o que foi feito, como foi provado, o que ainda falta. Sem maquiagem — os itens abertos estão na §6.

---

## 1. Resumo executivo

| Eixo | v1 | v2 | O que mudou |
|---|---|---|---|
| Arquitetura | 8 | **8.5** | Monólito modular confirmado como decisão (ADR-001); fronteiras agora impostas por CI (dependency-cruiser), não por disciplina; módulos se comunicam por eventos de domínio. |
| Escalabilidade | 5 | **8.5** | De 1 réplica obrigatória para N réplicas (Redis pub/sub, rate-limit e cache compartilhados; `SKIP LOCKED`; advisory locks). GPS: posição atual O(1), histórico particionado por dia, ingestão em lote com buffer offline. **2 réplicas em produção.** |
| Segurança | 6.5 | **8** | CSRF eliminado por design (auth só Bearer), CORS por tenant, zod, SSL estrito, token do WS fora da URL, arquivos por URL assinada, 1 falha de autorização real corrigida (§4). |
| Observabilidade | 3 | **8** | pino JSON com `reqId`/`empresaId`, Sentry, Prometheus `/metrics` + Grafana, health live/ready, graceful shutdown. |
| Governança | 3.5 | **8** | CI (lint · fronteiras · audit · 39 testes · boot em banco vazio · integração com Postgres+Redis reais), migrations versionadas com pre-deploy e rollback testado, 11 ADRs, OpenAPI da API pública. |

Em uma frase: **o sistema saiu de "funciona em 1 container" para "escala horizontalmente com evidência em produção", e de "sem testes, sem logs estruturados" para "CI que sobe a API em banco vazio e prova o isolamento de tenant a cada push".**

---

## 2. Arquitetura (o que dizer quando perguntarem)

**Monólito modular multi-tenant, stateless, com fronteiras impostas por ferramenta.** Shared database / shared schema com `empresa_id` em toda tabela, resolvido por middleware e propagado por `AsyncLocalStorage`. Redis para tudo que é compartilhado entre réplicas. Worker opcional para jobs — todo job roda sob advisory lock do Postgres, então é seguro mesmo embutido em N réplicas. Comunicação entre módulos por `index.js` (API pública) e eventos de domínio (`shared/eventos.js`).

**Por que não microserviços:** 1 dev, domínio em evolução, fronteiras ainda sendo descobertas. Os critérios objetivos de extração estão em `ARQUITETURA.md §7`; o primeiro candidato (`posicoes`, GPS) já está isolado como módulo, único escritor das suas tabelas — a extração é mover uma pasta e trocar o barramento in-process por Redis Streams.

**Regras de fronteira** (`ARQUITETURA.md §3`): módulo só importa outro pelo `index.js`; infra nunca importa módulo; sem ciclos; cada módulo é dono das suas tabelas; efeitos colaterais por evento; toda rota que grava tem schema; toda query filtra `empresa_id`; zero `console.*`. O CI falha em violação **nova**; a dívida existente está registrada (28 violações, eram 31).

---

## 3. O que foi feito, por sprint, com evidência

### Sprint 1 — Higiene, observabilidade, segurança básica
- **Log estruturado** (pino JSON) com `reqId`, `empresaId`, `usuarioId` injetados via ALS; `X-Request-Id` devolvido em toda resposta e no corpo de erros. Sentry opcional.
- **Auth só Bearer** (ADR-003). Cookie httpOnly apenas para refresh (rotativo, hash no banco). Middleware CSRF removido — não há superfície.
- **CORS negado por padrão**, depois **dinâmico por tenant** (a lista é a tabela `empresa_branding`, cache 5 min). Cliente white-label novo não exige deploy.
- **zod** nas rotas críticas (login, GPS, push); erros do Postgres mapeados (23505 → 409, 22P02 → 422); 500 nunca vaza mensagem interna.
- **Health** `/live` e `/ready` (banco); **graceful shutdown** em SIGTERM; `unhandledRejection` capturado.
- **CI**: ESLint, dependency-cruiser com baseline, `npm audit` (high+), vitest, **boot em Postgres vazio + seed + smoke**.
- Dockerfile: `npm ci`, `USER node`, `HEALTHCHECK`, Node 22. `.nvmrc`, `.editorconfig`, `CODEOWNERS`, `.gitattributes`.
- **Achado**: o sistema não subia em banco vazio (migration fazia `UPDATE entregas` antes do `CREATE TABLE`; FK circular `sla_config` ↔ `lojas`). Nunca apareceu porque produção já tinha as tabelas — mas impedia staging, testes e onboarding. Corrigido e coberto pelo CI.

### Sprint 2 — Concorrência e N réplicas
- **Redis opcional** (`shared/redis.js`, `family: 0` para a rede privada do Railway): pub/sub do WebSocket com id de instância (sem entrega duplicada), store do rate-limit, cache do ORS.
- **`promoverOndasPendentes`** com `FOR UPDATE SKIP LOCKED` em transação curta; notificações fora da transação.
- **Advisory locks** em todos os jobs do cron (`shared/locks.js`).
- **Barramento de eventos**: `oferta.aceita/recusada`, `entrega.ponto_concluido/concluida`; score e chat ouvem — filas/entregas não os conhecem mais.
- **`src/app.js`** separado de `server.js` → supertest. **Testes de integração**: isolamento de tenant (6 casos: B não vê entrega de A nem por id, nem por header, nem por listagem) e concorrência (3 execuções paralelas → 1 candidato).
- **Evidência em ambiente controlado**: 2 réplicas + Redis: GPS entrou na réplica A, painel conectado na B recebeu; 10 logins errados na A → 429 na primeira tentativa na B.
- **Em produção**: Redis do Railway, **Replicas = 2**.

### Sprint 3 — GPS em escala e schema versionado
- **Módulo `posicoes`** (único escritor de GPS). `motoboy_posicao_atual`: 1 linha por motoboy, UPSERT que nunca regride no tempo. 11 leituras de "última posição" em 8 módulos migradas — de `ORDER BY capturado_em DESC LIMIT 1` sobre histórico para 1 index scan.
- **`rastreamento` particionada por dia**; retenção = `DROP` da partição; cron mantém +7 dias. Migração testada com dados legados: 5.000 pontos em 40 dias → 49 partições em 308 ms; `down` e `up` nos dois sentidos.
- **Ingestão em lote** `POST /app/posicoes` (≤20 pontos, `capturado_em` preservado até 24 h — buffer offline não re-carimba posição velha como atual).
- **App**: task de background acumula todos os pontos que o Android entrega (antes descartava tudo menos o último), buffer persistente, envia em lote (entrega: 2 pts/30 s; ocioso: 4 pts/90 s). Sem rede: guarda e envia depois com o horário certo. **Publicado por OTA.**
- **Migrations versionadas** (`node-pg-migrate`): `railway.json` roda `npm run migrate` no pre-deploy; boot repete sob lock como rede de segurança; CI aplica em banco vazio.
- **Prometheus `/metrics`** (protegido por token): p95 por rota, GPS/s, WS, pool, ofertas abertas, uploads legados.

### Sprint 3b/3c — Arquivos fora da API e do banco
- **Achado**: fotos de protocolo eram gravadas em **base64 dentro do Postgres** (`protocolos.arquivo_url`, 90–190 KB por linha). Documentos/chat já iam ao R2; a conclusão ficou para trás.
- **Módulo `uploads`**: URL assinada de PUT (10 min, mime e tamanho validados), cliente envia direto ao R2, rota de negócio recebe a `storage_key` e confirma (prefixo da empresa + HEAD + tamanho). Leitura por URL assinada (1 h).
- **Compatibilidade**: base64 de clientes antigos é aceito, mas vai para o R2 — o banco nunca mais recebe base64. Contador `logix_uploads_legado_base64_total` diz quando o suporte pode sair.
- **Body JSON global 1 MB**; 15 MB só em rotas legadas listadas explicitamente.
- App e painel migrados para PUT direto com fallback automático (OTA + Vercel).
- Script `npm run fotos:migrar` move o legado do banco para o R2 em lotes; migration 0003 remove `rastreamento_legado`.
- **Evidência em produção**: `protocolos` nova com 132 caracteres vs 188.636 e 91.612 nas anteriores.

---

## 4. Falhas reais encontradas pelo processo (não pela sorte)

| Falha | Como apareceu | Gravidade |
|---|---|---|
| `concluir` e `concluir-sem-ponto` do app **não verificavam** se a entrega era da empresa nem se estava atribuída ao motoboy — qualquer UUID válido era aceito. | Teste manual da rota legada de 1,2 MB devolveu 200 para ids inexistentes. | **Alta** (integridade e isolamento) |
| Sem `CORS_ORIGIN`, a API refletia **qualquer origem com credentials**. | Leitura do `server.js`. | Alta |
| Sistema não subia em banco vazio. | Primeiro boot no CI. | Média (operacional) |
| Fotos em base64 no Postgres. | Inventário para o upload direto. | Média (custo/escala) |
| Cookie de sessão autenticava rotas de negócio com `sameSite=none` e CSRF nunca aplicado. | Leitura dos middlewares. | Média |
| `reqId` se perdia dentro das rotas `/api` (contexto reaberto). | Log sem `reqId` no teste. | Baixa |
| Botão "Imprimir" do comprovante morto por CSP (`onclick` inline). | Console do navegador em produção. | Baixa |
| Regra "módulos só via `index.js`" violada 31× (eu tinha dado nota alta lendo a estrutura). | Primeira execução do dependency-cruiser. | Governança |

O ponto a fazer na reunião: **nenhuma dessas foi encontrada por revisão de código isolada; todas saíram de ferramenta ou teste que agora roda em todo push.**

---

## 5. Números

- **39 testes** (31 unitários + 8 de integração com Postgres e Redis reais), 0 → 39.
- **11 ADRs** registradas em `ARQUITETURA.md`.
- **28 violações de fronteira** conhecidas (baseline), CI barra novas.
- Vulnerabilidades `npm audit --omit=dev`: 24 moderate → **5 moderate** (0 high/critical). As 5 restantes dependem de release do Express 4 (`qs`) e do `node-cron` (uuid transitivo).
- Linhas de foto no banco: ~100 KB → **~130 bytes**.
- Requests de GPS por motoboy em entrega: **−50%**; ocioso: **−75%** (com o OTA em todos os aparelhos).
- Réplicas da API: **1 → 2**, Redis, worker opcional.

---

## 6. O que ainda falta (ordem sugerida)

1. **Remover suporte a base64** (rotas legadas 15 MB, `resolverArquivo` legado) quando `logix_uploads_legado_base64_total` ficar zero por uma semana; rodar `npm run fotos:migrar` + `VACUUM FULL protocolos`.
2. **Row-Level Security** como segunda trava de tenant. Custo: `set_config` local exige transação por request ou reescrita do `shared/db.js`. Fazer depois que os testes de integração cobrirem mais rotas.
3. **Pagar as 28 violações de fronteira** módulo a módulo (tenant.js → permissoes; filas → precos; etc.).
4. **Fila de ingestão** (Redis Streams) entre `/app/posicoes` e o banco quando o volume justificar (>~50 pontos/s sustentados) — hoje 1 transação por lote é suficiente.
5. **Branding**: logo ainda em base64 na tabela (pequeno; migrar para o `uploads` com finalidade `logo`).
6. **OpenTelemetry** (traces por request com spans de pg/ORS) e **rotação de segredos** (`kid` no JWT).
7. **Documentação de DR/LGPD**: PITR habilitado, teste de restore trimestral, retenção de dados pessoais (GPS já tem).
8. Consolidar as migrations de boot (baseline) em um único arquivo versionado.

---

## 7. Como validar em 5 minutos (para o sênior)

```
GET  /health/ready            → ok, db_ms, pool, versão
GET  /metrics  (Bearer)       → logix_http_duracao_segundos, logix_gps_pontos_total, ...
GET  /api/v1/integracao/openapi.json
GitHub → Actions              → lint · fronteiras · audit · testes · boot em banco vazio · integração
Railway → API                 → 2 replicas · Redis · pre-deploy "npm run migrate"
Postgres → SELECT relkind FROM pg_class WHERE relname='rastreamento'  → 'p'
```

Documentos: `ARQUITETURA.md` (regras, ADRs, critérios de extração), `DEPLOY-*.md` por sprint, `docs/grafana/`.

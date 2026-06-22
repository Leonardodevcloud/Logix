# Logix — Plano de Execução

> Roadmap completo: do esqueleto atual ao app do motoboy publicado na Play Store.
> Cobre estado atual, decisões a tomar, blocos de trabalho e o modelo contínuo de
> testes, manutenção e atualização.

---

## 1. Estado atual

**O que já existe e está validado:**
- **Protótipo navegável — 14 telas** (Super Admin, Portal do Cliente, App do Motoboy + White-label). Serve de especificação visual.
- **Documento de arquitetura** (`Logix-arquitetura.md`): stack, modelo de dados multi-tenant, APIs, escalabilidade, Google Play, roadmap.
- **Backend (`logix-backend`)**: 5 módulos no padrão modular — `auth`, `empresas`, `motoboys`, `entregas`, `branding` — + middlewares, WebSocket e integração OpenRouteService. Sintaxe e grafo de `require` validados.
- **White-label**: módulo `branding`, `tokens.css`, `aplicar-tema.js` e tela de configuração com preview ao vivo.

**O que ainda NÃO existe (importante):**
- O backend **nunca rodou contra um banco real** — é esqueleto.
- Não há como criar o **primeiro super_admin** (não há seed).
- **Módulos restantes**: módulos/permissões, filas, maquininhas, financeiro, integrações, uploads.
- **Frontend real** (SPA): só temos o protótipo.
- **App do motoboy**: só temos os mockups — **não existe código React Native**.

---

## 2. Decisões a tomar antes (destravam vários blocos)

| # | Decisão | Recomendação |
|---|---|---|
| 1 | Object storage (fotos de comprovantes + logos do white-label) | **Cloudflare R2** (barato, compatível com S3) |
| 2 | Provedor de pagamento (saques do motoboy) | **Plific** (já usado na Central Tutts) ou Asaas/Pagar.me |
| 3 | Modelo de publicação na Play | **App único** com tema dinâmico (começar); app dedicado como tier premium |
| 4 | Domínio base + wildcard de subdomínio | ex.: `logix.com.br` + `*.logix.com.br` |
| 5 | Chave OpenRouteService + projeto FCM (push) | criar contas e gerar credenciais |

---

## 3. Bloco 0 — Subir e validar a corrente (PRIMEIRO PASSO)

**Objetivo:** transformar o esqueleto em algo que roda e testa. É o que de-risca todo o resto.

- [ ] Adicionar o serviço **PostgreSQL** ao projeto Railway → ele gera `DATABASE_URL` automaticamente. No app, use a URL **privada** (`*.railway.internal`) com `DB_SSL=false` (sem egress, menor latência). _Alternativas: Supabase (free tier) ou Postgres em VPS barato (Hetzner) com `DB_SSL` conforme o caso._
- [ ] Criar conta **OpenRouteService** → `ORS_API_KEY`
- [ ] **Railway · API**: deploy do `logix-backend` (Docker). Env: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `CORS_ORIGIN`, `ORS_API_KEY`, `DOMINIO_BASE`
- [ ] **Railway · Worker**: mesmo repo, comando `npm run worker`, mesmas env vars
- [ ] Primeiro boot → as migrations rodam sozinhas → conferir `GET /health`
- [ ] Criar o **super_admin** inicial: `npm run seed` (com `SEED_ADMIN_EMAIL` e `SEED_ADMIN_SENHA`)
- [ ] Rodar o **smoke-test**: `npm run smoke` (com `BASE_URL`, `ADMIN_EMAIL`, `ADMIN_SENHA`)
- [ ] **Vercel**: subir um front mínimo (login) já com `aplicar-tema.js`

> Já incluídos neste pacote: `scripts/seed.js` e `scripts/smoke-test.js`.

---

## 4. Bloco 1 — Completar o backend

Ordem por valor operacional:

1. **`modulos` + permissões** — *gating* real: middleware que bloqueia o tenant em módulo não contratado. É o que faz os planos e o white-label valerem comercialmente.
2. **`filas` + distribuição automática** — o coração da operação: puxar a fila "aguardando" e alocar o motoboy por proximidade. Aqui o WebSocket ganha uso real.
3. **`maquininhas`** — rápido; as telas já existem no protótipo.
4. **`financeiro`** — saldo + saques (depende do provedor de pagamento).
5. **`integracoes`** — `tokens_api` + `webhooks`: abre a API pública para ERPs.
6. **`uploads`** — object storage; destrava comprovantes e logos (hoje guardamos só URLs).

---

## 5. Bloco 2 — Frontend (Painel + Portal)

- SPA em **vanilla JS**, consumindo a API (padrão da Central Tutts).
- `aplicar-tema.js` no boot (white-label runtime).
- Lazy-load de módulos.
- Telas guiadas pelo protótipo.

---

## 6. Bloco 3 — App do motoboy (React Native + Expo)

- Scaffold Expo + TypeScript com navegação.
- **Telas**: login, início, aceitar/iniciar rota, navegação (handoff Waze/Google Maps), protocolo com **câmera**, ganhos/saque, perfil, notificações.
- **Rastreamento em background**: `expo-location` + `expo-task-manager` com **foreground service** (notificação persistente — exigência do Android e ponto-chave da aprovação na Play).
- **Push**: `expo-notifications` + **FCM**.
- **Tema**: carrega `/branding/eu` (white-label em runtime).
- **Config-driven**: regras e textos vêm do backend (muda sem atualizar o app).
- **`eas.json`** com perfis (development / preview / production) + **EAS Update (OTA)** habilitado.

---

## 7. Bloco 4 — Publicação na Play Store

- Conta de desenvolvedor Google Play (taxa única ~US$ 25).
- `applicationId` (ex.: `br.com.logix.motoboy`) + **Play App Signing**.
- **Permissões**: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`.
- **Política de privacidade** pública + formulário **Data Safety**.
- **Vídeo** justificando o uso de localização em background — o gargalo da revisão.
- **Trilhas**: `internal testing → closed (beta) → production`, com **rollout escalonado**.

---

## 8. Bloco 5 — Produção / hardening

- Particionar a tabela **`rastreamento`** por mês + expiração via worker (>90 dias).
- **RLS** opcional, índices revisados, connection pooling (Neon pooler).
- **Backups/PITR** (Neon) + branch de staging para testar migrations.
- **LGPD**: retenção mínima, anonimização de motoboy, consentimento de localização.
- Testes (unidade/integração) e monitoração/health.

---

## 9. Modelo contínuo de TESTES / MANUTENÇÃO / ATUALIZAÇÃO

A maior dúvida — "como mexo no app depois de no ar?". Com Expo há **dois caminhos**:

**a) OTA — EAS Update (sem passar pela Play)**
Mudanças de **JS, UI, lógica e correção de bug** vão direto para o aparelho, sem revisão e sem o motoboy atualizar pela loja. Propaga em horas, no próximo abrir do app.
*Não cobre*: código nativo, permissões, versão de runtime.

**b) Build nativo — novo `.aab` via EAS → Play (com revisão)**
Necessário só para **código nativo, dependência nativa, permissões, SDK ou ícone/nome/versão**. Passa pela revisão (horas a ~2 dias) e libera com **rollout escalonado**.

**Testar sem quebrar a produção — trilhas paralelas**
Manter o **Internal testing** (até 100 testadores, instantâneo, sem revisão) ao lado da produção. Validar cada build novo com a equipe e alguns motoboys reais e só então promover `internal → closed → production`.

**Rollback**
- Build: pausar o rollout escalonado.
- OTA: republicar o update anterior.

**Dois princípios que poupam meses de dor**
1. **Config-driven**: o máximo de comportamento (regras, textos, branding) vem do **backend** — muda sem tocar no app.
2. **App único** de tema dinâmico: um app só para manter; um OTA atinge todos os clientes de uma vez. App dedicado por cliente multiplica builds, revisões e manutenção.

**Alerta de campo**: rastreamento em background **tem que ser testado em aparelhos reais de vários fabricantes** (Xiaomi, Samsung etc. matam serviços em segundo plano por otimização de bateria). O emulador não revela isso — é o que faz o motoboy "sumir do mapa" em produção.

---

## 10. Sequenciamento recomendado

```
Bloco 0  (subir e validar)
   │
   ├── Bloco 1 (backend)  ─┐
   │                       ├── em paralelo
   └── Bloco 2 (frontend) ─┘
   │
Bloco 3  (app do motoboy)
   │
Bloco 4  (Play Store)
   │
Bloco 5  (hardening / produção)
```

---

## 11. Otimização de custos (Railway)

Decisões aplicadas para manter o custo perto do mínimo (≈ US$ 5/mês no início):

- **Um container só.** O `worker` foi embutido na API por padrão (`WORKER_EMBUTIDO=true`): os cron jobs rodam no mesmo processo. Elimina um container 24/7 que existia só para 1 limpeza diária. `worker.js` continua pronto para quando escalar.
- **Sem Redis (por enquanto).** O `node-cache` em memória resolve o cache de instância única. Redis só passa a valer quando houver **múltiplas instâncias** da API (para o *adapter* do WebSocket e cache compartilhado) — antes disso é só mais um container pago sem ganho.
- **Banco na rede privada do Railway** (`*.railway.internal`, `DB_SSL=false`): sem custo de egress entre API e banco e menor latência.
- **Retenção curta de rastreamento** (`RASTREAMENTO_RETENCAO_DIAS=30`) + gravar posição só durante entregas ativas: menos volume de banco (que é cobrado).
- **Pool de conexões enxuto** (`DB_POOL_MAX=5`): menos RAM na app e no banco.
- **Imagem slim** (`node:20-slim`, sem Chromium): build e cold start menores. (A Logix não usa RPA/Playwright.)
- **Staging com scale-to-zero**: ambientes de teste não cobram quando ociosos.

**Quando ligar o "modo escala" (worker separado + Redis):** ao passar de **1 instância** da API — aí o cron não pode rodar embutido (rodaria N vezes) e o WebSocket precisa do adapter Redis para propagar eventos entre instâncias.

## 12. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Localização em background reprovada na Play | Foreground service + vídeo de justificativa |
| Fabricante mata o background | Testes reais + pedir desativar otimização de bateria no onboarding |
| Rate limit do ORS | Cache de geocoding + cálculo de rota na fila/worker |
| Custo crescente | Começar com app único; escalar infra por fase |
| Vazamento entre tenants | `empresa_id` em toda query + RLS opcional |

# Logix — Deploy passo a passo (GitHub + Railway)

> **Monorepo:** se o backend está em `logix/backend`, no Railway defina **Root Directory = `/backend`** e **Watch Paths = `backend/**`**. O restante dos passos abaixo é idêntico.

Coloca o backend no ar: repositório, PostgreSQL no Railway, API rodando,
super_admin criado e smoke-test passando. Tempo estimado: ~30 min.

---

## 0. Pré-requisitos

- Conta no **GitHub** e no **Railway** (railway.com).
- **Node 18+** e **git** instalados na sua máquina.
- Uma **chave do OpenRouteService** (`ORS_API_KEY`) — crie grátis em openrouteservice.org.
- Opcional: GitHub CLI (`gh`) e Railway CLI (`npm i -g @railway/cli`).

Gere um segredo JWT forte (guarde):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 1. Repositório no GitHub

```bash
# descompacte o zip e entre na pasta
cd logix-backend

git init
git add .
git commit -m "Logix backend — inicial"
```

**Crie o repositório e suba.** Com GitHub CLI:
```bash
gh repo create logix-backend --private --source=. --remote=origin --push
```
Ou manualmente: crie o repo em github.com, depois:
```bash
git remote add origin https://github.com/SEU_USUARIO/logix-backend.git
git branch -M main
git push -u origin main
```

> Importante: a raiz do repositório deve ser a pasta `logix-backend` (o `Dockerfile` precisa
> ficar na raiz para o Railway detectar). Suba de DENTRO da pasta, como acima.

---

## 2. PostgreSQL no Railway

1. railway.com → **New Project**.
2. **+ New → Database → Add PostgreSQL**. Aguarde subir.
3. Pronto. O serviço Postgres já tem duas URLs (aba **Variables**):
   - `DATABASE_URL` → **privada** (`postgres.railway.internal:5432`, sem SSL) — para usar DENTRO do Railway.
   - `DATABASE_PUBLIC_URL` → **pública** (proxy, com SSL) — para acessar do seu PC.

---

## 3. API no Railway (deploy do repositório)

1. No MESMO projeto: **+ New → GitHub Repo** → autorize o Railway e escolha `logix-backend`.
2. O Railway detecta o `Dockerfile` e inicia o build. (O primeiro deploy pode falhar por falta de env — normal, configure no passo seguinte.)
3. No serviço da API, aba **Variables**, adicione:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` ← referência (resolve para a URL **privada**) |
| `DB_SSL` | `false` |
| `JWT_ACCESS_SECRET` | o segredo gerado no passo 0 |
| `ORS_API_KEY` | sua chave do OpenRouteService |
| `DOMINIO_BASE` | `logix.com.br` |
| `WORKER_EMBUTIDO` | `true` |
| `CORS_ORIGIN` | (deixe vazio por ora; preencha com a URL do front quando existir) |

> `PORT` é injetada automaticamente pelo Railway — não defina.
> A app já escuta em todas as interfaces na porta `PORT`, então funciona direto.

4. **Private Networking**: confirme que está ligado nos dois serviços (Settings → Networking). Em geral já vem ligado dentro do mesmo projeto.
5. **Domínio público da API**: serviço da API → **Settings → Networking → Generate Domain**. Anote a URL (ex.: `logix-api-production.up.railway.app`).
6. O deploy reinicia. Nos **Logs** você deve ver:
   ```
   [migrations] tabelas verificadas/criadas
   [cron:api] agendado (retenção rastreamento=30d)
   [logix-api] ouvindo na porta ...
   ```
7. Teste no navegador: `https://SUA_API.up.railway.app/health` → `{ "ok": true, ... }`.

---

## 4. Criar o super_admin (seed)

As tabelas já foram criadas no boot. O seed insere o primeiro usuário. Como o host **privado**
não resolve do seu PC, rode local usando a URL **pública** do Postgres:

1. Postgres (Railway) → aba **Variables** → copie `DATABASE_PUBLIC_URL`.
2. Na sua máquina:
```bash
cd logix-backend
npm install
DATABASE_URL="COLE_A_DATABASE_PUBLIC_URL" DB_SSL=true \
SEED_ADMIN_NOME="Seu Nome" \
SEED_ADMIN_EMAIL="voce@logix.com.br" \
SEED_ADMIN_SENHA="UmaSenhaForte123" \
npm run seed
```
Saída esperada: `Super admin criado: voce@logix.com.br (...)`.

---

## 5. Smoke-test (valida a corrente em produção)

O smoke bate na API por HTTP, então roda de qualquer lugar apontando para o domínio público:
```bash
BASE_URL="https://SUA_API.up.railway.app" \
ADMIN_EMAIL="voce@logix.com.br" \
ADMIN_SENHA="UmaSenhaForte123" \
npm run smoke
```
Esperado: uma sequência de `OK` (health → login → empresa → motoboy → entrega → acompanhar).
Se terminar com `Resultado: 6 OK, 0 falha(s).`, **a plataforma está de pé e validada.**

---

## 6. Deploy contínuo

A partir daqui, todo `git push` na branch `main` re-deploya a API automaticamente.
Fluxo recomendado: branch de feature → PR → merge em `main` → deploy.

---

## 7. (Depois) Frontend no Vercel

Quando o SPA existir: importe o repo do front no Vercel, configure os rewrites de SPA,
aponte a URL da API (ex.: `window.API_BASE`) e inclua o `aplicar-tema.js`. Adicione a URL do
Vercel em `CORS_ORIGIN` da API.

## 8. (Depois) Domínio próprio

- API: Railway → API → Settings → Networking → **Custom Domain** → `api.logix.com.br` (CNAME).
- Front: Vercel → `logix.com.br` + **wildcard** `*.logix.com.br` (para os subdomínios do white-label).

---

## Armadilhas comuns (leia)

- **Use a referência `${{Postgres.DATABASE_URL}}` (privada) na API.** Colar a URL pública faz o tráfego sair e voltar pela internet → erro de conexão e custo de egress.
- **`DB_SSL`**: `false` com a URL **privada** (dentro do Railway); `true` com a URL **pública** (seed local, ferramentas externas).
- **`postgres.railway.internal` NÃO resolve do seu PC** — localmente sempre use a URL pública.
- **Não ligue "App Sleeping"/Serverless na API de produção**: o cron das 03:00 e o WebSocket precisam dela acordada. (Pode ligar em ambientes de staging para economizar.)
- **Migrations rodam no boot** — não há passo separado de migração.

# Logix — Monorepo

Plataforma multiempresa de gestão de entregas. Um repositório, três partes isoladas:

```
logix/
├── backend/     API Node/Express (Railway, Docker)         → ver backend/DEPLOY.md
├── frontend/    SPA vanilla JS / PWA (Vercel, estático)    → ver frontend/README.md
└── app/         App do motoboy — React Native/Expo (EAS)   → a construir
```

`backend` e `frontend` **não compartilham código** (só o contrato HTTP da API), então é um
*monorepo isolado*: pastas comuns, sem Turborepo/workspaces.

---

## Deploy

Um único `git push` na `main`. Cada plataforma observa só a sua pasta.

### Backend → Railway
1. **New Project → Deploy from GitHub repo** → selecione este repositório.
2. No serviço criado, **Settings → Root Directory = `/backend`**.
   (Assim o Railway acha o `backend/Dockerfile` e roda tudo dentro de `backend/`.)
3. **Settings → Watch Paths = `backend/**`** → evita rebuild do backend quando você mexe só no frontend.
4. **+ New → Database → Add PostgreSQL** no mesmo projeto.
5. Variáveis do serviço backend:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (URL **privada**)
   - `DB_SSL` = `false`
   - `JWT_ACCESS_SECRET`, `ORS_API_KEY`, `DOMINIO_BASE=logix.com.br`, `WORKER_EMBUTIDO=true`
6. **Settings → Networking → Generate Domain** → anote a URL da API.

> Passo a passo detalhado (seed, smoke-test, armadilhas): `backend/DEPLOY.md`.
> Em monorepo só muda isto: definir Root Directory `/backend` e Watch Paths `backend/**`.

### Frontend → Vercel
1. **Add New → Project** → importe este mesmo repositório.
2. Em **Root Directory**, selecione **`frontend`**.
3. Deploy. O Vercel pula builds do frontend quando o commit não toca em `frontend/`.
4. Em produção, aponte `window.LOGIX_API` (em `frontend/index.html`) para a URL da API no Railway,
   e adicione a URL do Vercel em `CORS_ORIGIN` do backend.

### App → EAS (depois)
A pasta `app/` não vai para Railway/Vercel — o app Expo publica via EAS Build/Update na Google Play.

---

## Rodar local
- Backend: `cd backend && npm install && npm run dev`
- Frontend: `cd frontend && npx serve .`

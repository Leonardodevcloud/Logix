# Logix — Frontend (Painel + Portal)

SPA em **vanilla JS com ES Modules**, sem build step (deploy estático no Vercel).
Arquitetura deliberadamente modular — **sem `app.js` monolítico**.

## Estrutura

```
index.html            shell mínimo (mount point + imports)
vercel.json           rewrites SPA
manifest.json / sw.js PWA
assets/               tokens.css (design system) + logo
src/
  main.js             bootstrap MÍNIMO (tema, sessão, rotas)
  core/               infra reutilizável
    api.js            cliente HTTP (Bearer + refresh automático)
    auth.js           sessão (login/logout/restaurar)
    router.js         roteador hash + import dinâmico (code-splitting)
    layout.js         casca (sidebar + topbar)
    store.js          estado leve (pub/sub)
    ws.js             cliente WebSocket
    ui.js             helpers de DOM
    tema.js           white-label em runtime
  modulos/            uma feature por arquivo, carregada sob demanda
    login.js · dashboard.js · entregas.js · motoboys.js · clientes.js · branding.js
```

## Rodar local

Qualquer servidor estático (precisa de HTTP por causa dos ES Modules):
```bash
npx serve .          # ou: python3 -m http.server
```
Defina a base da API em `index.html` (`window.LOGIX_API`).

## Deploy (Vercel)

Importe o repositório → o `vercel.json` cuida dos rewrites de SPA. Em produção,
aponte `window.LOGIX_API` para a URL da API no Railway.

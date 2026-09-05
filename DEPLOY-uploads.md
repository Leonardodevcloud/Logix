# Upload direto ao storage (URL pré-assinada) — deploy

## O que muda
- Novo módulo `uploads`: `POST /api/v1/uploads/url` (painel), `/uploads/app/url` (motoboy),
  `/uploads/publico/:slug/url` (cadastro público). Resposta: `{ key, url, headers, expira_em }`.
- Cliente faz `PUT url` com o arquivo (header `Content-Type` igual ao pedido) e depois chama a
  rota de negócio com a `storage_key` (`fotos_keys`, `documentos[tipo] = key`, chat `arquivo = key`).
- **Fotos de protocolo deixam de ser gravadas em base64 no Postgres.** Tanto a chave (novo)
  quanto o base64 de apps antigos vão para o R2; o banco guarda só a chave (~100 bytes).
- Leitura devolve URL assinada (1 h). Registros antigos com base64/URL continuam funcionando.
- Body JSON global cai para 1 MB. Só as rotas legadas que ainda recebem base64 mantêm 15 MB
  (lista `ROTAS_LEGADAS_BASE64` em `src/app.js`) — encolhe quando app e painel migrarem.
- **Correção de segurança**: `concluir` e `concluir-sem-ponto` do app agora exigem que a entrega
  seja da empresa e esteja atribuída ao motoboy (antes qualquer id válido era aceito).

## OBRIGATÓRIO: CORS no bucket R2
Sem isto o navegador (painel) bloqueia o PUT direto. No Cloudflare → R2 → bucket → Settings → CORS:
```json
[
  {
    "AllowedOrigins": ["https://painel.logix.api.br", "https://logix-ochre.vercel.app", "https://painel.ig-express.com", "https://logix-apresentacao.vercel.app"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
Inclua TODOS os domínios white-label (cada cliente novo entra aqui também — ou use um
domínio único do painel com o BFF; o app nativo não precisa de CORS).

## Conferência pós-deploy
1. Painel → concluir um ponto com foto (fluxo antigo, base64): funciona; no banco
   `SELECT length(arquivo_url) FROM protocolos ORDER BY criado_em DESC LIMIT 1` → ~100 (antes ~300.000).
2. Detalhe da entrega concluída mostra as fotos (URLs assinadas).
3. `POST /api/v1/uploads/app/url` com token de motoboy devolve `url` do R2.

## Limpeza futura (depois que apps/painéis migrarem)
- Migrar `protocolos.arquivo_url` legados (base64) para o storage com um script em lote e
  recuperar espaço no Postgres (`VACUUM FULL protocolos` em janela de manutenção).
- Remover as rotas de `ROTAS_LEGADAS_BASE64` e o suporte a base64 em `uploads.resolverArquivo`.

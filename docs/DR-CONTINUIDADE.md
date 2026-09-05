# Continuidade e recuperação de desastres (DR)

> Documento para responder ao cliente B2B quando perguntar "e se cair?". Números alvo, o que já
> está garantido pela infraestrutura, e o que é procedimento.

## Objetivos
| Métrica | Alvo | Como é atendido |
|---|---|---|
| **RPO** (perda máxima de dados) | ≤ 5 min | PITR do Postgres gerenciado (Railway/Neon): WAL contínuo, restauração para qualquer instante da janela. |
| **RTO** (tempo máximo fora) | ≤ 60 min | Infra declarativa (`railway.json`, Dockerfile, variáveis documentadas em `.env.example`); banco restaurado por PITR; DNS já aponta para os serviços. |
| Disponibilidade da API | 99,5 %/mês (≈ 3,6 h) | 2 réplicas, healthcheck `/health/ready`, restart automático, graceful shutdown. |

## Componentes e o que acontece se cada um cair
| Componente | Estado sem ele | Recuperação |
|---|---|---|
| API (1 réplica) | Outra réplica atende; zero impacto. | Railway reinicia a réplica (restartPolicy ON_FAILURE). |
| API (todas) | Painel e app sem resposta; app do motoboy guarda GPS em buffer (até 40 pontos) e reenvia. | Redeploy do último commit verde; < 5 min. |
| Postgres | Tudo para. | PITR pelo painel do provedor para instante antes do incidente; atualizar `DATABASE_URL` se o host mudar; redeploy. |
| Redis | API continua (fallback automático para memória); tempo real entre réplicas e rate-limit compartilhado degradam até voltar. | Reinicia sozinho; nada a restaurar (só cache/pub-sub). |
| Storage R2 | Fotos/documentos não abrem; conclusão de corrida continua (fotos ficam em fallback base64 → storage quando voltar). | Cloudflare gerencia; 11 noves de durabilidade. |
| Vercel (painel) | Painel fora; API, app e integrações continuam. | Redeploy; ou rollback instantâneo para deploy anterior no painel da Vercel. |
| ORS (rotas) | Criação de corrida sem otimização/ETA; distância por haversine. | Provedor externo; cache de rotas em Redis reduz dependência. |

## Backups
- **Postgres**: backups automáticos do provedor + PITR. **Verificar habilitado** em Railway → Postgres → Backups (ou Neon → Branches/PITR).
- **Storage R2**: replicação interna do Cloudflare. Para cópia fora do provedor: `rclone sync` semanal para um segundo bucket (opcional, recomendado ao passar de 50 GB).
- **Código**: GitHub (`Leonardodevcloud/Logix`, `appboylogix`), branch `main` protegida pelo CI.
- **Segredos**: só nas Variables do Railway/Vercel/EAS. **Manter cópia offline** (gerenciador de senhas) de: `JWT_ACCESS_SECRET`, `STORAGE_*`, `METRICS_TOKEN`, `SENTRY_DSN`, credenciais ORS/Google/Expo.

## Teste de restauração (trimestral — o backup só existe se já foi restaurado uma vez)
1. Criar um novo serviço Postgres no Railway a partir de um snapshot/PITR de ontem.
2. Apontar um ambiente de staging (`DATABASE_URL` do snapshot, `NODE_ENV=production`, `CORS_ORIGIN` de staging).
3. Subir a API: migrations devem dizer `nada pendente`; `/health/ready` ok; login funciona; uma entrega abre com fotos.
4. Registrar data, duração e problemas em `docs/DR-TESTES.md`. Apagar o serviço temporário.

## Runbook de incidente (ordem)
1. **Ver** `/health/ready` da API e o status do Railway/Vercel/Cloudflare.
2. **Logs** com filtro `"level":50` (erro) e `"level":60` (fatal); Sentry para stack; Grafana para quando começou.
3. **Rollback primeiro, diagnóstico depois**: Railway → Deployments → deploy anterior → Redeploy. Vercel idem.
4. Se for banco: PITR para 5 min antes do primeiro sintoma.
5. Comunicar clientes afetados (canal definido por contrato) com hora de início, impacto e previsão.
6. Post-mortem em 48 h: causa, o que faltou detectar, ação preventiva → vira item no roadmap.

## Contatos e acessos (preencher)
- Railway: conta ____ (2FA ativo?) · Vercel: ____ · Cloudflare: ____ · Neon: ____ · Expo/EAS: `leonardologix`
- Segunda pessoa com acesso de emergência: ____ (evitar ponto único de falha humano).

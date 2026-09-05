# Grafana Cloud + Prometheus para o Logix (≈15 min)

## 1. Conta e coleta
1. https://grafana.com → **Create free account** (Grafana Cloud Free: 10k séries, 14 dias de retenção — sobra).
2. No stack: **Connections → Add new connection → "Metrics endpoint"** (scrape de um endpoint HTTP).
   - **Scrape URL:** `https://logix-production-61ae.up.railway.app/metrics`
   - **Authentication:** Bearer → cole o valor de `METRICS_TOKEN` (Railway → API → Variables)
   - **Scrape interval:** 30s
   - Nome do job: `logix-api`
3. Teste a conexão. Em ~1 min as séries `logix_*` aparecem em Explore.

> Com 2+ réplicas atrás do mesmo domínio, cada scrape cai numa réplica diferente: os
> contadores (`_total`) e o histograma HTTP continuam corretos em `rate()`; gauges
> por réplica (memória, conexões WS) alternam. Para visão por réplica, Railway →
> Metrics já mostra CPU/RAM de cada uma.

## 2. Dashboard
**Dashboards → New → Import → Upload JSON** → `logix-api-dashboard.json` → escolha o datasource Prometheus.

Painéis: requests/s por status · p95 por rota · 5xx/min · pontos GPS/s (total e em lote) ·
conexões WS · pool Postgres · ofertas aguardando · uploads legados em base64 · RSS · event-loop lag.

## 3. Alertas (Alerting → Alert rules → New)
| Alerta | Expressão | Por | Significado |
|---|---|---|---|
| Erros 5xx | `sum(rate(logix_http_duracao_segundos_count{status=~"5.."}[5m])) / sum(rate(logix_http_duracao_segundos_count[5m])) > 0.01` | 5 min | >1% das requisições falhando |
| Latência | `histogram_quantile(0.95, sum by (le) (rate(logix_http_duracao_segundos_bucket[5m]))) > 1` | 10 min | p95 acima de 1 s |
| GPS parou | `sum(rate(logix_gps_pontos_total[5m])) == 0 and sum(logix_ws_conexoes{tipo="motoboy"}) > 0` | 5 min | motoboys conectados mas nenhum ping — incidente de negócio |
| Pool esgotado | `sum(logix_pg_pool{estado="aguardando"}) > 0` | 2 min | requisições esperando conexão com o banco |
| API fora | `up{job="logix-api"} == 0` | 2 min | scrape falhando |

Contact point: e-mail ou WhatsApp via webhook (n8n já está conectado na sua conta — dá para rotear para o Digisac).

## 4. Sentry (erros com stack)
Se ainda não fez: sentry.io → projeto Node → copie o DSN → Railway `SENTRY_DSN`. Cada 500 vira um issue com stack, `reqId` e rota. Grátis até 5k eventos/mês.

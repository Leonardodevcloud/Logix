# Logix — Sprint 3 (GPS em escala). Rodar em Downloads com o ZIP ao lado da pasta logix.
# LEIA DEPLOY-sprint3.md antes: confira o tamanho de rastreamento em produção.
$ErrorActionPreference = 'Stop'
Expand-Archive .\logix-sprint3-gps-escala-particoes-migrations.zip . -Force
Set-Location logix\backend
npm install
npm run check
Set-Location ..
git add -A
git status --short | Select-Object -First 40
Write-Host "`nSe tudo passou:  git commit -m 'feat(sprint3): modulo posicoes, posicao atual, rastreamento particionada, gps em lote, migrations versionadas, /metrics' ; git push"

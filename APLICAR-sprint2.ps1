# Logix — Sprint 2 (A+B). Rodar em Downloads com o ZIP ao lado da pasta logix.
$ErrorActionPreference = 'Stop'
Expand-Archive .\logix-sprint2-redis-eventos-locks-app.zip . -Force
if (Test-Path .\logix\backend\src\middleware\cache.js) { Remove-Item .\logix\backend\src\middleware\cache.js -Force; Write-Host "removido: middleware/cache.js" }
Set-Location logix\backend
npm install
npm run check
Set-Location ..
git add -A
git status --short | Select-Object -First 40
Write-Host "`nSe tudo passou:  git commit -m 'feat(sprint2): redis opcional (ws pub/sub, rate-limit, cache), eventos de dominio, locks, src/app.js, testes integracao' ; git push"

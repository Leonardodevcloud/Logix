# Logix — Sprint 5: RLS (desligado por padrão), fronteiras pagas, branding via uploads, docs DR/LGPD.
$ErrorActionPreference = 'Stop'
Expand-Archive .\logix-sprint5-rls-fronteiras-branding-dr-lgpd.zip . -Force
Set-Location logix\backend
npm run check
Set-Location ..
git add -A
git status --short | Select-Object -First 60
Write-Host "`nSe passou:  git commit -m 'feat(sprint5): RLS (migration 0004, RLS_ENABLED), fronteiras de modulo pagas (28->3), logo via uploads, docs DR/LGPD' ; git push"

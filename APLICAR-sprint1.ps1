# Logix — Sprint 1: aplica o overlay e remove código morto.
# Rodar na pasta Downloads, com logix-sprint1-observabilidade-seguranca-ci.zip ao lado da pasta logix.
#   cd $env:USERPROFILE\Downloads ; .\APLICAR-sprint1.ps1
$ErrorActionPreference = 'Stop'
Expand-Archive .\logix-sprint1-observabilidade-seguranca-ci.zip . -Force

# Arquivos/pastas removidos nesta sprint (overlay não apaga; aqui sim):
$mortos = @(
  'logix\backend\src\middleware\csrf.js',        # ADR-003: cookie não autentica mais → CSRF sem superfície
  'logix\backend\src\middleware\webhookAuth.js',  # nunca foi usado (e rawBody nunca era capturado)
  'logix\fix',                                    # cópia antiga do ORS com URL deprecada
  'logix\app',                                    # só um README; o app vive no repo appboylogix
  'logix\package-lock.json'                       # lock vazio na raiz
)
foreach ($m in $mortos) { if (Test-Path $m) { Remove-Item $m -Recurse -Force; Write-Host "removido: $m" } }

Set-Location logix\backend
npm install
npm run check          # lint + fronteiras + testes — tem que passar antes do push
Set-Location ..
git add -A
git status --short | Select-Object -First 40
Write-Host "`nRevise o status acima e então:  git commit -m 'sprint1: observabilidade, seguranca, CI, fronteiras' ; git push"
Write-Host "Depois no Railway: adicionar CORS_ORIGIN (se ainda nao tiver), NODE_ENV=production, opcional SENTRY_DSN. Healthcheck path: /health/ready"

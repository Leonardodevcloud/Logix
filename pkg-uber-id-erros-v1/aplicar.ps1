# pkg-uber-id-erros-v1 — Banner Uber ID + Erros traduzidos
# Arquivo: modulo-logistica.js

$ErrorActionPreference = 'Stop'
$repo = "$env:USERPROFILE\tutts-frontend"
$alvo = "$repo\modulo-logistica.js"

if (-not (Test-Path $alvo)) {
  Write-Error "ERRO: $alvo nao encontrado. Verifique o caminho do repo."
  exit 1
}

$pkg = Split-Path -Parent $MyInvocation.MyCommand.Path

# Backup
$bak = "$alvo.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $alvo $bak
Write-Host "Backup: $bak"

function Patch {
  param($nome, $oldFile, $newFile)
  $conteudo = [System.IO.File]::ReadAllText($alvo, [System.Text.Encoding]::UTF8)
  $old = [System.IO.File]::ReadAllText($oldFile, [System.Text.Encoding]::UTF8)
  $new = [System.IO.File]::ReadAllText($newFile, [System.Text.Encoding]::UTF8)
  $old = $old.Replace("`r`n", "`n")
  $new = $new.Replace("`r`n", "`n")
  $conteudo = $conteudo.Replace("`r`n", "`n")
  if (-not $conteudo.Contains($old)) {
    Write-Error "PATCH $nome FALHOU: trecho antigo nao encontrado. Arquivo ja aplicado ou desatualizado."
    exit 1
  }
  $resultado = $conteudo.Replace($old, $new)
  [System.IO.File]::WriteAllText($alvo, $resultado, [System.Text.UTF8Encoding]::new($false))
  Write-Host "OK: $nome aplicado."
}

Patch "01_modal_uber_banner" `
  "$pkg\patches\01_modal_uber_banner.old.txt" `
  "$pkg\patches\01_modal_uber_banner.new.txt"

Patch "02_erros_traduzidos" `
  "$pkg\patches\02_erros_traduzidos.old.txt" `
  "$pkg\patches\02_erros_traduzidos.new.txt"

Write-Host ""
Write-Host "Patches aplicados com sucesso!"
Write-Host ""
Write-Host "--- GIT ---"
Write-Host "cd $repo"
Write-Host "git add -f modulo-logistica.js"
Write-Host "git commit -m ""feat(hub): banner Uber ID no modal + erros traduzidos PT-BR"""
Write-Host "git pull --rebase origin main"
Write-Host "git push origin main"

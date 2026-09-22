param(
  [Parameter(Mandatory=$true)]
  [string]$Version
)

Write-Host "== C-Optimizer :: Pipeline de Release ==" -ForegroundColor Cyan

if (-not $env:GH_TOKEN) {
  Write-Error "GH_TOKEN nao definido. Crie um Personal Access Token do GitHub (escopo 'repo') e defina a variavel de ambiente antes de continuar:`n  `$env:GH_TOKEN = 'seu_token_aqui'"
  exit 1
}

Write-Host "`n[1/5] Atualizando versao no package.json para $Version..." -ForegroundColor Yellow
npm version $Version --no-git-tag-version --allow-same-version
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao atualizar a versao."; exit 1 }

Write-Host "`n[2/5] Instalando dependencias (npm ci)..." -ForegroundColor Yellow
npm ci
if ($LASTEXITCODE -ne 0) { Write-Error "Falha no npm ci."; exit 1 }

Write-Host "`n[3/5] Buildando o Renderer (Vite)..." -ForegroundColor Yellow
npm run build:renderer
if ($LASTEXITCODE -ne 0) { Write-Error "Falha no build do renderer."; exit 1 }

Write-Host "`n[4/5] Empacotando e publicando via electron-builder..." -ForegroundColor Yellow
npx electron-builder --publish always
if ($LASTEXITCODE -ne 0) { Write-Error "Falha no electron-builder."; exit 1 }

Write-Host "`n[5/5] Concluido!" -ForegroundColor Green
Write-Host "Acesse https://github.com/c-optimizer/c-optimizer/releases para revisar o draft," -ForegroundColor Green
Write-Host "confirmar os artefatos (.exe + latest.yml) e publicar a release." -ForegroundColor Green
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$tmp = Join-Path $env:TEMP ('stability-deploy-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item -Recurse -Path (Join-Path $PSScriptRoot 'dist') -Destination (Join-Path $tmp 'dist')
New-Item -ItemType Directory -Path (Join-Path $tmp 'backend') | Out-Null
Copy-Item -Recurse -Path (Join-Path $PSScriptRoot 'sdct\backend\api') -Destination (Join-Path $tmp 'backend\api')
$nodeModules = Join-Path $tmp 'backend\api\node_modules'
if (Test-Path $nodeModules) { Remove-Item -Recurse -Force $nodeModules }
$package = @{
  name = 'stability-capture-webapp'
  private = $true
  scripts = @{
    start = 'node backend/api/src/server.js'
    postinstall = 'npm ci --omit=dev --omit=optional --prefix backend/api'
  }
} | ConvertTo-Json -Depth 5
Set-Content -Encoding UTF8 -Path (Join-Path $tmp 'package.json') -Value $package
$zip = Join-Path $tmp 'deploy.zip'
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $zip -Force
Write-Host "ZIP=$zip"
az webapp deploy -g nsus-dv-sfdf-usea-rgp -n nsus-dv-sfdfdev-adi-281-app --src-path $zip --type zip

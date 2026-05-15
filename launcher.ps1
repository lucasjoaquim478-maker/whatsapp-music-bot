<#
.SYNOPSIS
  WhatsApp Music Bot - Launcher com Auto-Update
.DESCRIPTION
  Verifica atualizações no GitHub, baixa se houver, e inicia o bot.
#>

$RepoOwner = "lucasjoaquim478-maker"
$RepoName = "whatsapp-music-bot"
$VersionFile = Join-Path $PSScriptRoot "version.json"
$BotScript = Join-Path $PSScriptRoot "index.js"

function Write-Color($Text, $Color) {
  Write-Host $Text -ForegroundColor $Color
}

function Get-LocalVersion {
  if (Test-Path $VersionFile) {
    try {
      $json = Get-Content $VersionFile -Raw | ConvertFrom-Json
      return $json.version
    } catch { return "0.0.0" }
  }
  return "0.0.0"
}

function Get-RemoteVersion {
  try {
    $url = "https://api.github.com/repos/$RepoOwner/$RepoName/releases/latest"
    $release = Invoke-RestMethod -Uri $url -ErrorAction Stop
    return @{
      version = $release.tag_name.TrimStart('v')
      downloadUrl = $release.zipball_url
      htmlUrl = $release.html_url
    }
  } catch {
    return $null
  }
}

function Compare-Versions($v1, $v2) {
  $parts1 = $v1.Split('.')
  $parts2 = $v2.Split('.')
  for ($i = 0; $i -lt 3; $i++) {
    $n1 = [int]($parts1[$i] -replace '[^0-9]', 0)
    $n2 = [int]($parts2[$i] -replace '[^0-9]', 0)
    if ($n1 -lt $n2) { return $true }
    if ($n1 -gt $n2) { return $false }
  }
  return $false
}

function Update-Application($remote) {
  Write-Color "`n📥 Baixando atualização v$($remote.version)..." Yellow
  $tempDir = Join-Path $env:TEMP "whatsapp-music-bot-update"
  $zipFile = Join-Path $env:TEMP "whatsapp-music-bot-update.zip"

  if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
  if (Test-Path $zipFile) { Remove-Item -Force $zipFile }

  try {
    Invoke-WebRequest -Uri $remote.downloadUrl -OutFile $zipFile -ErrorAction Stop
    Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force

    $extracted = Get-ChildItem $tempDir -Directory | Select-Object -First 1
    if (-not $extracted) { throw "Pasta extraída não encontrada" }

    $exclude = @('node_modules', '.env', 'session', '.wwebjs_auth', '.wwebjs_cache')
    Get-ChildItem $extracted.FullName | Where-Object { $_.Name -notin $exclude } | ForEach-Object {
      $dest = Join-Path $PSScriptRoot $_.Name
      if ($_.PSIsContainer) {
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Copy-Item -Recurse -Path $_.FullName -Destination $dest
      } else {
        Copy-Item -Path $_.FullName -Destination $dest -Force
      }
    }

    Write-Color "✅ Atualização aplicada!" Green
  } catch {
    Write-Color "❌ Erro na atualização: $_" Red
  } finally {
    if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue }
    if (Test-Path $zipFile) { Remove-Item -Force $zipFile -ErrorAction SilentlyContinue }
  }
}

function Install-Dependencies {
  Write-Color "📦 Verificando dependências..." Yellow
  $npmPath = Join-Path $PSScriptRoot "node_modules"
  if (-not (Test-Path $npmPath)) {
    Write-Color "   Instalando npm packages..." Yellow
    Set-Location $PSScriptRoot
    npm install --production 2>&1 | Out-Null
  }
}

# ===== MAIN =====
Clear-Host
Write-Color "╔══════════════════════════════════════╗" Cyan
Write-Color "║     WhatsApp Music Bot - Launcher    ║" Cyan
Write-Color "╚══════════════════════════════════════╝" Cyan

$localVersion = Get-LocalVersion
Write-Color "`n📌 Versão local: v$localVersion" White

Write-Color "🔍 Verificando atualizações..." Yellow
$remoteInfo = Get-RemoteVersion

if ($remoteInfo -and (Compare-Versions $localVersion $remoteInfo.version)) {
  Write-Color "✨ Nova versão disponível: v$($remoteInfo.version)" Green
  Update-Application $remoteInfo
  $localVersion = $remoteInfo.version
  $localVersion | ForEach-Object {
    try { @{ version = $remoteInfo.version } | ConvertTo-Json | Set-Content $VersionFile } catch {}
  }
} else {
  Write-Color "✅ Você já está na versão mais recente!" Green
}

Install-Dependencies

Write-Color "`n🚀 Iniciando bot..." Cyan
Write-Color "   Pressione Ctrl+C para parar`n" DarkGray

Set-Location $PSScriptRoot
node index.js

Write-Color "`n❌ Bot encerrado. Pressione qualquer tecla para fechar..." DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

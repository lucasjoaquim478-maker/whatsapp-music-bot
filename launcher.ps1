<#
.SYNOPSIS
  WhatsApp Music Bot - Launcher com Auto-Update
.DESCRIPTION
  Verifica atualizações no GitHub, baixa se houver, e inicia o bot.
#>

$ScriptDir = try {
  $p = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
  if ($p) { [System.IO.Path]::GetDirectoryName($p) } else { $null }
} catch { $null }

if (-not $ScriptDir) {
  $ScriptDir = try {
    Split-Path -Parent -LiteralPath ([Environment]::GetCommandLineArgs()[0])
  } catch { $null }
}

if (-not $ScriptDir) {
  $ScriptDir = try { $PSScriptRoot } catch { $null }
}

if (-not $ScriptDir) {
  $ScriptDir = (Get-Location).Path
}

$RepoOwner = "lucasjoaquim478-maker"
$RepoName = "whatsapp-music-bot"
$VersionFile = Join-Path $ScriptDir "version.json"
$BotScript = Join-Path $ScriptDir "index.js"

function Write-Color($Text, $Color) {
  Write-Host $Text -ForegroundColor $Color
}

function Get-LocalVersion {
  if (Test-Path -LiteralPath $VersionFile) {
    try {
      $json = Get-Content -LiteralPath $VersionFile -Raw | ConvertFrom-Json
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
  $zipFile  = Join-Path $env:TEMP "whatsapp-music-bot-update.zip"

  if (Test-Path -LiteralPath $tempDir) { Remove-Item -Recurse -Force -LiteralPath $tempDir }
  if (Test-Path -LiteralPath $zipFile) { Remove-Item -Force -LiteralPath $zipFile }

  try {
    Invoke-WebRequest -Uri $remote.downloadUrl -OutFile $zipFile -ErrorAction Stop
    Expand-Archive -LiteralPath $zipFile -DestinationPath $tempDir -Force

    $extracted = Get-ChildItem -LiteralPath $tempDir -Directory | Select-Object -First 1
    if (-not $extracted) { throw "Pasta extraída não encontrada" }

    $exclude = @('node_modules', '.env', 'session', '.wwebjs_auth', '.wwebjs_cache')
    Get-ChildItem -LiteralPath $extracted.FullName | Where-Object { $_.Name -notin $exclude } | ForEach-Object {
      $dest = Join-Path $ScriptDir $_.Name
      if ($_.PSIsContainer) {
        if (Test-Path -LiteralPath $dest) { Remove-Item -Recurse -Force -LiteralPath $dest }
        Copy-Item -Recurse -LiteralPath $_.FullName -Destination $dest
      } else {
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
      }
    }

    Write-Color "✅ Atualização aplicada!" Green
  } catch {
    Write-Color "❌ Erro na atualização: $_" Red
  } finally {
    if (Test-Path -LiteralPath $tempDir) { Remove-Item -Recurse -Force -LiteralPath $tempDir -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $zipFile) { Remove-Item -Force -LiteralPath $zipFile -ErrorAction SilentlyContinue }
  }
}

function Install-Dependencies {
  Write-Color "📦 Verificando dependências..." Yellow
  $npmPath = Join-Path $ScriptDir "node_modules"
  if (-not (Test-Path -LiteralPath $npmPath)) {
    Write-Color "   Instalando npm packages..." Yellow
    Set-Location -LiteralPath $ScriptDir
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
  try {
    @{ version = $remoteInfo.version } | ConvertTo-Json | Set-Content -LiteralPath $VersionFile
  } catch {
    Write-Color "⚠️  Não foi possível atualizar version.json" Yellow
  }
} else {
  Write-Color "✅ Você já está na versão mais recente!" Green
}

Install-Dependencies

Write-Color "`n🚀 Iniciando bot..." Cyan
Write-Color "   Pressione Ctrl+C para parar`n" DarkGray

try {
  Set-Location -LiteralPath $ScriptDir
  node index.js
} catch {
  Write-Color "❌ Erro ao iniciar: $_" Red
}

Write-Color "`n❌ Bot encerrado. Pressione qualquer tecla para fechar..." DarkGray
pause > $null

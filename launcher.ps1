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

# Cleanup de arquivos temporários de update
$oldExe = Join-Path $ScriptDir "launcher.exe.old"
$newExe = Join-Path $ScriptDir "launcher.exe.new"
$restartBat = Join-Path $ScriptDir "_restart.bat"
if (Test-Path -LiteralPath $oldExe) { Remove-Item -Force -LiteralPath $oldExe -ErrorAction SilentlyContinue }
if (Test-Path -LiteralPath $newExe) { Remove-Item -Force -LiteralPath $newExe -ErrorAction SilentlyContinue }
if (Test-Path -LiteralPath $restartBat) { Remove-Item -Force -LiteralPath $restartBat -ErrorAction SilentlyContinue }

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

    $currentExe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $newExe = Join-Path $extracted.FullName "launcher.exe"
    $newExePath = Join-Path $ScriptDir "launcher.exe.new"
    if (Test-Path -LiteralPath $newExe) {
      [System.IO.File]::Copy($newExe, $newExePath, $true) | Out-Null
    }

    $batchContent = @"
@echo off
title Aplicando atualizacao...
set "SRC=$($extracted.FullName)"
set "DST=$ScriptDir"
xcopy "%SRC%" "%DST%" /E /I /Y >NUL
if exist "%DST%\node_modules" rmdir /S /Q "%DST%\node_modules" >NUL 2>NUL
exit
"@
    $batchFile = Join-Path $env:TEMP "_apply_update.bat"
    $batchContent | Set-Content -LiteralPath $batchFile -Encoding ASCII

    $restartContent = @"
@echo off
title Reiniciando WhatsApp Music Bot...
timeout /t 2 /nobreak >NUL
call "$batchFile"
if exist "$newExePath" (
  copy /Y "$newExePath" "$currentExe" >NUL
  del "$newExePath"
)
start "" "$currentExe"
exit
"@
    $restartFile = Join-Path $ScriptDir "_restart.bat"
    $restartContent | Set-Content -LiteralPath $restartFile -Encoding ASCII

    Write-Color "✅ Atualização baixada! Reiniciando para aplicar..." Green
    $script:needsRestart = $true

  } catch {
    Write-Color "❌ Erro na atualização: $_" Red
    $script:needsRestart = $false
  } finally {
    Remove-Item -Recurse -Force -LiteralPath $tempDir -ErrorAction SilentlyContinue
    Remove-Item -Force -LiteralPath $zipFile -ErrorAction SilentlyContinue
  }
}

function Install-Dependencies {
  Write-Color "📦 Verificando dependências..." Yellow
  $npmPath = Join-Path $ScriptDir "node_modules"
  if (-not (Test-Path -LiteralPath $npmPath)) {
    Write-Color "   Instalando npm packages (pode levar alguns minutos)..." Yellow
    Set-Location -LiteralPath $ScriptDir
    $env:PUPPETEER_SKIP_DOWNLOAD = "true"
    npm install 2>&1 | ForEach-Object { Write-Color "   $_" DarkGray }
    if ($LASTEXITCODE -ne 0) {
      Write-Color "⚠️  npm install falhou. Tentando de novo ignorando puppeteer..." Yellow
      npm install --ignore-scripts 2>&1 | ForEach-Object { Write-Color "   $_" DarkGray }
    }
    if ($LASTEXITCODE -ne 0) {
      Write-Color "❌ Falha ao instalar dependências. Execute manualmente: npm install" Red
      Write-Color "   Continuando mesmo assim..." Yellow
    } else {
      Write-Color "   ✅ Dependências instaladas!" Green
    }
  }
}

# ===== MAIN =====
try {
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
    $script:needsRestart = $false
    Update-Application $remoteInfo
    try {
      @{ version = $remoteInfo.version } | ConvertTo-Json | Set-Content -LiteralPath $VersionFile
      if ($script:needsRestart) {
        Write-Color "🔄 Reiniciando para aplicar atualização..." Yellow
        Start-Process -FilePath (Join-Path $ScriptDir "_restart.bat") -WindowStyle Hidden
        exit 0
      }
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
    cmd /c "node index.js" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
      Write-Color "⚠️  Node encerrou com código: $LASTEXITCODE" Yellow
    }
  } catch {
    Write-Color "❌ Erro ao iniciar: $_" Red
  }

  Write-Color "`n❌ Bot encerrado." DarkGray
} catch {
  Write-Color "`n❌ Erro inesperado: $_" Red
} finally {
  Write-Color "   Pressione qualquer tecla para fechar..." DarkGray
  cmd /c pause > $null
}

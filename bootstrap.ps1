$scriptDir = [System.IO.Path]::GetDirectoryName([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName)
& powershell -ExecutionPolicy Bypass -NoLogo -File (Join-Path $scriptDir "launcher.ps1")

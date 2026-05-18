@echo off
setlocal

set "PROJECT_DIR=%~dp0"
REM Eliminar barra final
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

set "HOTKEY=CTRL+ALT+V"

REM Usar PowerShell para resolver la ruta real del Escritorio (funciona con OneDrive)
powershell -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$lnk = Join-Path $desktop 'Speech to Prompt.lnk';" ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$s = $ws.CreateShortcut($lnk);" ^
  "$s.TargetPath = '%PROJECT_DIR%\launcher.vbs';" ^
  "$s.WorkingDirectory = '%PROJECT_DIR%';" ^
  "$s.Description = 'Speech to Prompt - Nota de voz rapida';" ^
  "$s.Hotkey = 'CTRL+ALT+V';" ^
  "$s.Save();" ^
  "Write-Host ('Acceso directo creado: ' + $lnk)"

echo  Atajo de teclado:      %HOTKEY%
echo.
echo  Para cambiar el atajo de teclado:
echo    1. Clic derecho en "Speech to Prompt" del Escritorio
echo    2. Propiedades ^> campo "Tecla de metodo abreviado"
echo    3. Pulsa la nueva combinacion y haz clic en Aceptar
echo.
pause

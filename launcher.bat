@echo off
setlocal

REM Comprueba si el servidor ya esta corriendo en localhost:3000
set "TMPFILE=%TEMP%\stp_check_%RANDOM%.tmp"
curl -s --max-time 1 -o NUL -w "%%{http_code}" http://localhost:3000 > "%TMPFILE%" 2>NUL
set /p HTTP_STATUS=<"%TMPFILE%"
del "%TMPFILE%" 2>NUL

if "%HTTP_STATUS%"=="200" (
    start "" "http://localhost:3000"
    exit /b 0
)

REM Servidor no encontrado: arrancarlo desde el directorio del proyecto
cd /d "%~dp0"
node server.js

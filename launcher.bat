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

REM Servidor no encontrado: arrancarlo desde el directorio del proyecto.
REM --watch reinicia el backend automaticamente al cambiar archivos de src/server.
REM --env-file=.env carga las credenciales locales (SQL, usuario dev). NO carga
REM .env.dev, asi que el navegador SI se abre (a diferencia de "npm run dev").
cd /d "%~dp0"
node --watch --env-file-if-exists=.env server.js

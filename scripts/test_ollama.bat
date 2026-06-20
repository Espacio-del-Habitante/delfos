@echo off
REM Prueba de conexión con Ollama local para Delfos
REM Uso: scripts\test_ollama.bat
REM Ajusta OLLAMA_URL y OLLAMA_MODEL en .env si es necesario.

set "OLLAMA_URL=http://127.0.0.1:11434"
set "OLLAMA_MODEL=llama3.2"

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="OLLAMA_URL" set "OLLAMA_URL=%%B"
    if "%%A"=="OLLAMA_MODEL" set "OLLAMA_MODEL=%%B"
  )
)

echo.
echo === Delfos — prueba Ollama ===
echo URL:   %OLLAMA_URL%
echo Model: %OLLAMA_MODEL%
echo.

echo [1/3] Verificar que Ollama responde...
curl -s --max-time 5 "%OLLAMA_URL%/api/tags"
if errorlevel 1 (
  echo.
  echo ERROR: No hay respuesta en %OLLAMA_URL%
  echo.
  echo Solucion:
  echo   1. Instala Ollama: https://ollama.com/download
  echo   2. Inicia el servicio (abre la app Ollama en Windows^)
  echo   3. Descarga un modelo: ollama pull llama3.2
  echo   4. Vuelve a ejecutar este script
  exit /b 1
)

echo.
echo.
echo [2/3] Generar JSON de prueba (puede tardar ~30s la primera vez^)...
curl -s --max-time 120 -X POST "%OLLAMA_URL%/api/generate" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"%OLLAMA_MODEL%\",\"prompt\":\"Responde solo este JSON: {\\\"ok\\\": true}\",\"stream\":false,\"format\":\"json\"}"

echo.
echo.
echo [3/3] Si ves "ok": true arriba, Ollama funciona con Delfos.
echo.

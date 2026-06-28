# Build de Delfos como un único .exe (Windows).
# Uso:  powershell -ExecutionPolicy Bypass -File .\build_exe.ps1
# Resultado: backend\dist\Delfos.exe (doble clic -> abre el navegador en localhost:5000)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "==> 1/3  Compilando frontend (Astro)..." -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
# API en el mismo origen que Flask -> rutas relativas /api (sin CORS).
$env:PUBLIC_API_BASE_URL = ""
if (-not (Test-Path "node_modules")) { npm install }
npm run build
Pop-Location

$dist = Join-Path $root "frontend\dist"
if (-not (Test-Path (Join-Path $dist "index.html"))) {
    throw "No se encontró frontend\dist\index.html. El build del frontend falló."
}

Write-Host "==> 2/3  Sincronizando dependencias del backend..." -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
uv sync

Write-Host "==> 3/3  Empaquetando con PyInstaller..." -ForegroundColor Cyan
uv run pyinstaller --noconfirm --clean --onefile --name Delfos `
    --add-data "..\frontend\dist;frontend_dist" `
    --collect-all yfinance `
    app.py
Pop-Location

$exe = Join-Path $root "backend\dist\Delfos.exe"
if (Test-Path $exe) {
    Write-Host "`nListo. Ejecutable en: $exe" -ForegroundColor Green
    Write-Host "Doble clic para arrancar (abre http://localhost:5000). Los datos se guardan en %LOCALAPPDATA%\Delfos\data." -ForegroundColor Green
} else {
    throw "PyInstaller no generó $exe"
}

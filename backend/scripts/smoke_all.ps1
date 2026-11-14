# Smoke local: API assistant + unit test de multi-chat/memoria.
# Uso (desde repo root o backend/):
#   powershell -ExecutionPolicy Bypass -File .\backend\scripts\smoke_all.ps1

$ErrorActionPreference = "Stop"
$backend = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $backend "app.py"))) {
  $backend = Join-Path (Split-Path -Parent $PSScriptRoot) "backend"
}
Set-Location $backend

Write-Host "== unit: multi-thread + memory =="
uv run python -m unittest tests.test_api.AssistantProfileTestCase.test_assistant_multi_thread_and_shared_memory -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== smoke: assistant flow =="
uv run python scripts/smoke_assistant_flow.py
exit $LASTEXITCODE

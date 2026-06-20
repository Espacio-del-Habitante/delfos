#!/usr/bin/env bash
# Prueba de conexión con Ollama local para Delfos
# Uso: bash scripts/test_ollama.sh

set -a
[ -f .env ] && source .env
set +a

OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2}"

echo ""
echo "=== Delfos — prueba Ollama ==="
echo "URL:   $OLLAMA_URL"
echo "Model: $OLLAMA_MODEL"
echo ""

echo "[1/3] Verificar que Ollama responde..."
if ! curl -s --max-time 5 "$OLLAMA_URL/api/tags"; then
  echo ""
  echo "ERROR: No hay respuesta en $OLLAMA_URL"
  echo ""
  echo "Solución:"
  echo "  1. Instala Ollama: https://ollama.com/download"
  echo "  2. Inicia: ollama serve"
  echo "  3. Descarga modelo: ollama pull $OLLAMA_MODEL"
  exit 1
fi

echo ""
echo ""
echo "[2/3] Generar JSON de prueba..."
curl -s --max-time 120 -X POST "$OLLAMA_URL/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$OLLAMA_MODEL\",\"prompt\":\"Responde solo este JSON: {\\\"ok\\\": true}\",\"stream\":false,\"format\":\"json\"}"

echo ""
echo ""
echo "[3/3] Si ves \"ok\": true arriba, Ollama funciona con Delfos."
echo ""

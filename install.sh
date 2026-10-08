#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -f package.json ]; then
  echo "Arquivo package.json não encontrado." >&2
  exit 1
fi

npm install

if [ ! -f .env ]; then
  cat > .env <<'EOF'
PORT=3000
NEMOTRON_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NEMOTRON_API_KEY=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
NEMOTRON_MODEL_NAME=nvidia/nemotron-3-ultra-550b-a55b
OBSIDIAN_VAULT_PATH=./vault
EOF
  echo "Arquivo .env criado automaticamente."
fi

mkdir -p vault

echo "Instalação concluída. Rode: npm start"

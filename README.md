# J.A.R.V.I.S Mobile HUD

Aplicativo mobile estilo HUD futurista com assistente de voz, memória em Obsidian e integração com Nemotron 3 Ultra via API compatível com OpenAI.

## Como executar

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Crie um arquivo `.env` baseado em `.env.example`.
3. Configure a URL, chave e nome do modelo Nemotron 3 Ultra.
4. Inicie o servidor:
   ```bash
   npm start
   ```
5. Abra o navegador em `http://localhost:3000`.

## Variáveis de ambiente

```env
PORT=3000
NEMOTRON_API_URL=https://seu-endpoint-nemotron/v1/chat/completions
NEMOTRON_API_KEY=sua-chave
NEMOTRON_MODEL_NAME=nemotron-3-ultra
OBSIDIAN_VAULT_PATH=./vault
```

## Integrações

- Nemotron 3 Ultra em `NEMOTRON_API_URL`
- Obsidian via `OBSIDIAN_VAULT_PATH`
- Google Search e Google Scholar via endpoint `/api/search`
- Reconhecimento de voz via Web Speech API
- Síntese de voz via `speechSynthesis`

## Observações

- O projeto usa um endpoint OpenAI-compatible para o Nemotron 3 Ultra.
- Se o provedor do seu modelo usa um nome diferente, ajuste `NEMOTRON_MODEL_NAME`.
- O comportamento “sarcasticamente útil” está configurado no prompt do assistente.

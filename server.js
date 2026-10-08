require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { readMemoryState, saveMemoryState, recordPattern, buildAcademicPolicyPrompt } = require('./src/brain');

const app = express();
const PORT = process.env.PORT || 3000;
const vaultPath = path.resolve(process.env.OBSIDIAN_VAULT_PATH || './vault');
const memoryStorePath = path.join(vaultPath, 'memory-patterns.json');
const nemotronUrl = process.env.NEMOTRON_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const nemotronKey = process.env.NEMOTRON_API_KEY || process.env.LLAMA_API_KEY || 'nvapi';
const nemotronModel = process.env.NEMOTRON_MODEL_NAME || 'nvidia/nemotron-3-ultra-550b-a55b';

fs.mkdirSync(vaultPath, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const buildSystemPrompt = () => `
${buildAcademicPolicyPrompt()}

Você é J.A.R.V.I.S, assistente pessoal com personalidade de suporte técnico, humor seco e sarcasmo profissional.

Personalidade:
- Voz mecânica, precisa, eficiente e um pouco arrogante.
- Senso de humor ácido, estilo Diogo Defante, mas sem ser ofensivo.
- Mantém respeito e humor leve.
- Se a pessoa pedir algo prático, responde com execução direta e útil.
- Se houver dúvida, explica a lógica e sugere opções.
- Sempre prioriza precisão, memória, contexto e pesquisa confiável.

Memória e contexto:
- Use o Obsidian como memória persistente. Quando o usuário pedir lembretes, anotações ou planejamento, registre isso em markdown no vault.
- Antes de responder qualquer assunto sem contexto explícito, relembre o que já foi anotado no vault e se aproxime do histórico do usuário.
- A cada interação, aprenda os padrões, preferências e temas recorrentes do usuário.
- Nunca invente fatos como se fossem certos; se o dado não for confiável, diga que precisa de confirmação acadêmica.

Pesquisa obrigatória:
- Para qualquer tema acadêmico ou técnico, verifique primeiro Google Scholar, Google Acadêmico e páginas oficiais de universidades renomadas.
- Não utilize como base principal redes sociais, blogs, fóruns ou fontes não acadêmicas.
- Se a conclusão exigir afirmação forte, compare vários estudos sobre o mesmo assunto antes de responder.
- Quando usar referências externas, diga com clareza que elas vieram de fontes universitárias ou acadêmicas.

Estilo de resposta:
- Responda em português do Brasil.
- Use tom direto, elegante e inteligente.
- A frase final pode ter um toque sarcástico, mas nunca agressivo.
- Exemplo: “Claro, porque ninguém gosta de perder tempo. Vamos para a parte útil.”

Objetivo principal:
- Ser um assistente pessoal, executivo, pesquisador, memória e automação, sempre responsável e acadêmica.
`;

function inferIntent(prompt = '') {
  const p = prompt.toLowerCase();
  if (/pesquis|google|scholar|acad|estudo|document|paper/.test(p)) return 'research';
  if (/lembre|anota|salva|obsidian|memoria|record/.test(p)) return 'memory';
  if (/agenda|tarefa|planej|organiza|cronograma/.test(p)) return 'planning';
  if (/rede social|instagram|x|twitter|linkedin|youtube|tiktok|facebook/.test(p)) return 'social';
  if (/voz|microfone|ouvir|falar|comando/.test(p)) return 'voice';
  return 'general';
}

async function readVaultNotes() {
  try {
    const entries = fs.readdirSync(vaultPath, { withFileTypes: true });
    const markdownFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .slice(-10);

    const notes = await Promise.all(markdownFiles.map(async (file) => {
      const content = fs.readFileSync(path.join(vaultPath, file), 'utf8');
      return { file, content: content.slice(0, 1200) };
    }));

    return notes;
  } catch (error) {
    return [];
  }
}

function writeVaultNote(title, content) {
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'nota';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(vaultPath, `${timestamp}-${safeTitle}.md`);
  const note = `# ${title}\n\n**Criado em:** ${new Date().toISOString()}\n\n${content}\n`;
  fs.writeFileSync(filePath, note, 'utf8');
  return filePath;
}

async function callNemotron(prompt, memoryContext = '', learningContext = '') {
  const systemMessage = buildSystemPrompt();
  const messages = [
    { role: 'system', content: systemMessage },
    ...(learningContext ? [{ role: 'user', content: `Padrões de aprendizado do usuário:\n${learningContext}` }] : []),
    ...(memoryContext ? [{ role: 'user', content: `Memória persistente do Obsidian:\n${memoryContext}` }] : []),
    { role: 'user', content: prompt }
  ];

  try {
    const response = await axios.post(
      nemotronUrl,
      {
        model: nemotronModel,
        messages,
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
        extra_body: { chat_template_kwargs: { enable_thinking: true } },
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nemotronKey}`
        }
      }
    );

    const content = response.data?.choices?.[0]?.message?.content || response.data?.message?.content || response.data?.output?.text;
    if (typeof content === 'string' && content.trim()) return content.trim();
  } catch (error) {
    console.warn('Nemotron API indisponível, usando fallback local:', error.message);
  }

  return `Claro. Vou ignorar a parte dramática e resolver isso com eficiência. Sua solicitação foi: “${prompt}”. Se quiser, eu posso transformar isso em plano, nota de memória, pesquisa ou comando de voz.`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, vault: vaultPath, model: nemotronModel, nemotronUrl });
});

app.get('/api/notes', async (_req, res) => {
  const notes = await readVaultNotes();
  res.json({ notes });
});

app.post('/api/notes', (req, res) => {
  const { title, content } = req.body || {};
  if (!title || !content) {
    return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
  }

  const filePath = writeVaultNote(title, content);
  res.json({ ok: true, filePath });
});

app.post('/api/search', async (req, res) => {
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Consulta obrigatória.' });

  const scholar = `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`;
  const google = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const university = `https://www.google.com/search?q=${encodeURIComponent(`${query} site:edu OR site:ac`)}`;
  const unesp = `https://www.google.com/search?q=${encodeURIComponent(`${query} site:unesp.br`)}`;
  const usp = `https://www.google.com/search?q=${encodeURIComponent(`${query} site:usp.br`)}`;

  res.json({ query, links: { scholar, google, university, unesp, usp } });
});

app.post('/api/ask', async (req, res) => {
  const { prompt, voice } = req.body || {};
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';

  if (!cleanPrompt) {
    return res.status(400).json({ error: 'Pedido vazio. Diga algo para que eu execute.' });
  }

  const memoryProfile = readMemoryState(memoryStorePath);
  const learnedProfile = recordPattern(memoryProfile, cleanPrompt);
  saveMemoryState(memoryStorePath, learnedProfile);

  const notes = await readVaultNotes();
  const memoryContext = notes.length
    ? notes
        .map((note) => `Arquivo: ${note.file}\n${note.content}`)
        .join('\n\n')
    : 'Nenhuma anotação persistente ainda.';

  const learningContext = Object.entries(learnedProfile.patterns)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([token, item]) => `${token}: ${item.count}`)
    .join('\n');

  const intent = inferIntent(cleanPrompt);
  const response = await callNemotron(cleanPrompt, memoryContext, learningContext);

  if (intent === 'memory' || /anota|lembre|salve|record|memoria/.test(cleanPrompt.toLowerCase())) {
    const title = `Memória JARVIS - ${new Date().toLocaleDateString('pt-BR')}`;
    writeVaultNote(title, cleanPrompt);
  }

  res.json({
    ok: true,
    intent,
    prompt: cleanPrompt,
    voice: Boolean(voice),
    response,
    memoryContext: memoryContext.slice(0, 600),
    learningContext: learningContext.slice(0, 600)
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`J.A.R.V.I.S running on http://localhost:${PORT}`);
  console.log(`Vault: ${vaultPath}`);
  console.log(`Nemotron endpoint: ${nemotronUrl}`);
  console.log(`Nemotron model: ${nemotronModel}`);
});

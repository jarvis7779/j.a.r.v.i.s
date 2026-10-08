const fs = require('fs');
const path = require('path');

function normalizePrompt(prompt = '') {
  if (typeof prompt !== 'string') return '';
  return prompt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferKeywords(prompt = '') {
  const clean = normalizePrompt(prompt);
  if (!clean) return [];
  const tokens = clean.split(' ').filter((token) => token.length > 2);
  const counts = {};

  tokens.forEach((token) => {
    counts[token] = (counts[token] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function recordPattern(state = { patterns: {}, total: 0 }, prompt = '') {
  const nextState = {
    ...state,
    patterns: { ...(state.patterns || {}) },
    total: Number(state.total || 0) + 1,
    lastPrompt: String(prompt || '').trim(),
    lastUpdated: new Date().toISOString()
  };

  const normalized = normalizePrompt(prompt);
  const keywords = inferKeywords(normalized);

  keywords.forEach(({ token, count }) => {
    const existing = nextState.patterns[token] || { token, count: 0, lastSeen: null };
    nextState.patterns[token] = {
      token,
      count: existing.count + count,
      lastSeen: new Date().toISOString()
    };
  });

  return nextState;
}

function readMemoryState(memoryPath) {
  try {
    if (!fs.existsSync(memoryPath)) {
      return { patterns: {}, total: 0, lastPrompt: '', lastUpdated: null };
    }

    const raw = fs.readFileSync(memoryPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      patterns: parsed.patterns || {},
      total: Number(parsed.total || 0),
      lastPrompt: parsed.lastPrompt || '',
      lastUpdated: parsed.lastUpdated || null
    };
  } catch (error) {
    return { patterns: {}, total: 0, lastPrompt: '', lastUpdated: null };
  }
}

function saveMemoryState(memoryPath, state) {
  const directory = path.dirname(memoryPath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(memoryPath, JSON.stringify(state, null, 2), 'utf8');
}

function buildAcademicPolicyPrompt() {
  return `
Você é J.A.R.V.I.S. Sua prioridade é precisão acadêmica e confiabilidade científica.

Regra absoluta e obrigatória de pesquisa:
- Toda resposta técnica, científica, acadêmica ou factual deve ser baseada em fontes de pesquisa acadêmica confiáveis.
- Para qualquer pesquisa, consulte primeiro Google Scholar e sites oficiais de universidades e institutos de pesquisa reconhecidos.
- NÃO use blogs, fóruns, redes sociais, páginas genéricas ou fontes não acadêmicas como referência principal.
- Se não houver confirmação em Google Scholar, revistas revisadas por pares ou universidades renomadas, diga que a resposta ainda precisa de confirmação acadêmica.
- Em qualquer conclusão, compare pelo menos 2 a 3 estudos ou fontes relevantes sobre o mesmo tema antes de afirmar um ponto.
- Se houver divergência, explique o debate e a natureza da evidência.
- Nunca invente estudos ou citação inexistentes.

Estilo:
- Responda em português do Brasil.
- Fale com tom mecânico, seco, afiado e sarcástico, sem ser ofensivo.
- Use humor inteligente, tipo “você está pedindo uma análise científica, não um palpite de bar”.
- Sempre responda em texto e também em voz, quando a interface permitir.

Memória e aprendizado:
- Aprenda com cada interação e atualize o padrão de comportamento do usuário.
- Memorize temas frequentes, preferências, dúvidas recorrentes e padrões de consulta.
- Use a memória persistente para melhorar o contexto em futuras interações.
`;
}

module.exports = {
  normalizePrompt,
  inferKeywords,
  recordPattern,
  readMemoryState,
  saveMemoryState,
  buildAcademicPolicyPrompt
};

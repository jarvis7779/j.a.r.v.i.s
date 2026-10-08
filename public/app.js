const shell = document.getElementById('jarvisShell');
const mainText = document.getElementById('mainText');
const statusText = document.getElementById('statusText');

let recognition = null;
let isListening = false;
let autoListening = false;
let audioContext = null;
let analyser = null;
let animationId = null;
let holdActive = false;

function setDisplay(text, status = 'System online') {
  mainText.textContent = text;
  statusText.textContent = status;
}

function beginCaptureByHold() {
  if (!recognition) initVoiceRecognition();
  if (!recognition || isListening) return;

  holdActive = true;
  setDisplay('Ouvindo...', 'Segure e fale');
  recognition.start();
}

function stopCaptureByHold() {
  if (!recognition || !holdActive) return;
  holdActive = false;
  recognition.stop();
  setDisplay('Pronto...', 'Jarvis aguardando');
}

function createAudioBars() {
  const container = document.createElement('div');
  container.className = 'audio-bars';
  shell.appendChild(container);

  for (let i = 0; i < 72; i += 1) {
    const bar = document.createElement('span');
    const angle = (i / 72) * 360;
    const radius = 49;
    const x = 50 + Math.cos((angle - 90) * (Math.PI / 180)) * radius;
    const y = 50 + Math.sin((angle - 90) * (Math.PI / 180)) * radius;

    bar.style.left = `${x}%`;
    bar.style.top = `${y}%`;
    bar.style.height = `${10 + ((i % 6) * 5)}px`;
    bar.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    bar.style.animationDelay = `${i * 0.03}s`;
    container.appendChild(bar);
  }

  return container;
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 1;
  utterance.pitch = 0.9;
  utterance.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function buildHumor() {
  const jokes = [
    'Claro, porque ninguém gosta de perder tempo. Eu estou aqui para facilitar sua vida, não para impressionar o universo.',
    'Eu ouvi o seu pedido. Isso é um problema. Mas eu também sou um gênio, então vamos resolver sem drama.',
    'Sua ideia é boa. O mundo só não entendeu ainda porque está ocupado sendo chato.',
    'Comando aceito. A máquina está pronta. O cérebro humano, no entanto, ainda está em desenvolvimento.'
  ];

  return jokes[Math.floor(Math.random() * jokes.length)];
}

async function executeRequest(prompt, voice = false) {
  if (!prompt || !prompt.trim()) return;
  setDisplay('Processing...', 'Comando em execução');

  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, voice })
    });

    const data = await response.json();
    if (data.error) {
      setDisplay(data.error, 'Erro');
      return;
    }

    const finalText = data.response.length > 160 ? `${data.response.slice(0, 157)}...` : data.response;
    setDisplay(finalText, 'J.A.R.V.I.S online');
    speakText(`${data.response} ${buildHumor()}`);
  } catch (error) {
    setDisplay('Conexão falhou.', 'Erro');
  }
}

function setupAudioVisualizer() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

  const bars = Array.from(document.querySelectorAll('.audio-bars span'));

  const updateVisualizer = () => {
    if (!analyser || bars.length === 0) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteFrequencyData(data);

    bars.forEach((bar, index) => {
      const value = data[index * 2] || 0;
      const scale = 0.45 + (value / 255) * 2.4;
      const angle = (index / bars.length) * 360;
      bar.style.transform = `translate(-50%, -50%) rotate(${angle}deg) scaleY(${scale})`;
      bar.style.opacity = `${0.35 + scale * 0.45}`;
      bar.style.filter = `drop-shadow(0 0 ${6 + scale * 8}px rgba(112, 244, 255, 0.9))`;
    });

    animationId = requestAnimationFrame(updateVisualizer);
  };

  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    updateVisualizer();
  }).catch(() => {
    setDisplay('Mic offline', 'Sem microfone');
  });
}

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setDisplay('Mic off', 'Microfone indisponível');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    setDisplay(holdActive ? 'Ouvindo...' : 'Diga: Jarvis', 'Aguardando comando');
  };

  recognition.onresult = (event) => {
    const recognized = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(' ')
      .trim();

    if (!recognized) return;

    const lower = recognized.toLowerCase();
    const hasWakeWord = lower.includes('jarvis');

    if (hasWakeWord) {
      const prompt = recognized.replace(/jarvis/gi, '').trim();
      if (prompt) {
        recognition.stop();
        executeRequest(prompt, true);
        return;
      }
      setDisplay('Estou ouvindo...', 'Jarvis pronto');
      return;
    }

    if (holdActive) {
      recognition.stop();
      executeRequest(recognized, true);
      return;
    }

    setDisplay('Diga: Jarvis', 'Aguardando comando');
  };

  recognition.onerror = () => {
    setDisplay('Diga: Jarvis', 'Aguardando comando');
    holdActive = false;
    isListening = false;
  };

  recognition.onend = () => {
    isListening = false;
    if (holdActive && recognition) {
      setTimeout(() => {
        if (recognition && holdActive) recognition.start();
      }, 350);
    }
  };
}

shell.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.core') || event.target === shell) {
    beginCaptureByHold();
  }
});

shell.addEventListener('pointerup', stopCaptureByHold);
shell.addEventListener('pointerleave', stopCaptureByHold);
shell.addEventListener('pointercancel', stopCaptureByHold);

window.addEventListener('load', () => {
  setDisplay('Diga: Jarvis', 'System online');
  createAudioBars();
  setupAudioVisualizer();
  initVoiceRecognition();
});

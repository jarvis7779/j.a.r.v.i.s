#!/usr/bin/env python3
"""JARVIS - assistente de voz em Python (Termux e PC).
Primeira vez / reconfigurar:  python jarvis.py --config
"""
import json, math, os, random, re, shutil, struct, subprocess, sys, tempfile
import threading, time, wave, webbrowser
import tkinter as tk
import urllib.parse, urllib.request

CFG_PATH = os.path.expanduser("~/.jarvis.json")
API = "https://integrate.api.nvidia.com/v1/chat/completions"
TERMUX = shutil.which("termux-speech-to-text") is not None
DN = subprocess.DEVNULL

# ---------------- configuração ----------------
def load_cfg():
    d = {"name": "senhor", "key": "", "model": "", "contacts": {}, "wake": False}
    try:
        d.update(json.load(open(CFG_PATH, encoding="utf-8")))
    except Exception:
        pass
    return d

def setup():
    c = load_cfg()
    print("Configuração do Jarvis (Enter mantém o valor atual)")
    c["name"] = input(f"Como te chamar [{c['name']}]: ") or c["name"]
    c["key"] = input("Chave NVIDIA (nvapi-...): ") or c["key"]
    c["model"] = input(f"ID do modelo Nemotron [{c['model']}]: ") or c["model"]
    print("Contatos, um por linha: nome=número ou e-mail (linha vazia termina)")
    while True:
        l = input("> ").strip()
        if not l:
            break
        if "=" in l:
            a, b = l.split("=", 1)
            c["contacts"][a.strip().lower()] = b.strip()
    c["wake"] = input("Ficar ouvindo a palavra 'Jarvis'? (s/n): ").lower() == "s"
    json.dump(c, open(CFG_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------------- efeitos sonoros ----------------
RATE = 22050
def make_wav(path, parts):
    fr = bytearray()
    for f1, f2, d, v, kind in parts:
        n, ph = int(RATE * d), 0.0
        for i in range(n):
            k = i / n
            ph += 2 * math.pi * f1 * (f2 / f1) ** k / RATE
            if kind == "s":
                x = math.sin(ph)
            elif kind == "w":
                x = 2 * ((ph / (2 * math.pi)) % 1) - 1
            else:
                x = 1 if math.sin(ph) > 0 else -1
            fr += struct.pack("<h", int(32767 * v * x * math.sin(math.pi * k) ** .5))
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(bytes(fr))

SFX = {}
def build_sfx():
    d = tempfile.mkdtemp()
    defs = {
        "boot": [(90, 1400, 1.0, .3, "w"), (1200, 1250, .25, .25, "t")],
        "on": [(700, 1100, .14, .4, "s")],
        "off": [(900, 500, .16, .4, "s")],
        "err": [(220, 110, .35, .3, "w")],
        "think": [(random.randint(300, 800), 200, .08, .12, "q") for _ in range(14)],
    }
    for k, parts in defs.items():
        SFX[k] = os.path.join(d, k + ".wav")
        make_wav(SFX[k], parts)

def play(name):
    p = SFX.get(name)
    try:
        if TERMUX:
            subprocess.Popen(["termux-media-player", "play", p], stdout=DN, stderr=DN)
        elif sys.platform.startswith("win"):
            import winsound
            winsound.PlaySound(p, winsound.SND_FILENAME | winsound.SND_ASYNC)
        elif sys.platform == "darwin":
            subprocess.Popen(["afplay", p])
        else:
            subprocess.Popen(["aplay", "-q", p], stderr=DN)
    except Exception:
        pass

# ---------------- voz: fala e escuta ----------------
def speak(text):
    try:
        if TERMUX:
            subprocess.run(["termux-tts-speak", "-l", "pt-BR", "-p", "0.7", "-r", "0.95", text])
        elif sys.platform == "darwin":
            subprocess.run(["say", "-v", "Felipe", text])
        elif shutil.which("espeak-ng"):
            subprocess.run(["espeak-ng", "-v", "pt-br+m3", "-p", "30", "-s", "150", text])
        else:
            import pyttsx3
            e = pyttsx3.init(); e.setProperty("rate", 160); e.say(text); e.runAndWait()
    except Exception:
        pass

def listen():
    try:
        if TERMUX:
            r = subprocess.run(["termux-speech-to-text"], capture_output=True, text=True, timeout=30)
            return r.stdout.strip()
        import speech_recognition as sr
        rec = sr.Recognizer()
        with sr.Microphone() as m:
            rec.adjust_for_ambient_noise(m, .3)
            a = rec.listen(m, timeout=6, phrase_time_limit=12)
        return rec.recognize_google(a, language="pt-BR")
    except Exception:
        return ""

# ---------------- cérebro (Nemotron / API NVIDIA) ----------------
def sys_prompt(cfg):
    ct = "\n".join(f"{k}={v}" for k, v in cfg["contacts"].items()) or "(nenhum)"
    return f"""Você é o JARVIS, assistente pessoal de voz, educado, elegante e com humor seco. Responda sempre em português do Brasil, em no máximo 2 frases curtas, tratando o usuário por "{cfg['name']}".
Contatos disponíveis:
{ct}
Responda SOMENTE com JSON, sem texto fora dele:
{{"fala":"o que você diz em voz alta","acao":null}}
Para WhatsApp: "acao":{{"tipo":"whatsapp","para":"nome do contato","texto":"mensagem"}}
Para e-mail: "acao":{{"tipo":"email","para":"nome do contato","assunto":"...","texto":"..."}}
Nunca diga que enviou: você apenas prepara a mensagem e o usuário confirma na tela."""

def think(text, cfg, hist):
    hist.append({"role": "user", "content": text})
    del hist[:-8]
    body = json.dumps({"model": cfg["model"], "temperature": .5, "max_tokens": 400,
                       "messages": [{"role": "system", "content": sys_prompt(cfg)}] + hist}).encode()
    req = urllib.request.Request(API, body, {"Content-Type": "application/json",
                                             "Authorization": "Bearer " + cfg["key"]})
    with urllib.request.urlopen(req, timeout=90) as r:
        c = json.load(r)["choices"][0]["message"]["content"] or ""
    c = re.sub(r"<think>.*?</think>", "", c, flags=re.S).strip()
    hist.append({"role": "assistant", "content": c})
    try:
        return json.loads(c[c.index("{"):c.rindex("}") + 1])
    except Exception:
        return {"fala": c, "acao": None}

# ---------------- ações: WhatsApp e e-mail ----------------
def open_url(u):
    if TERMUX:
        subprocess.Popen(["termux-open-url", u])
    else:
        webbrowser.open(u)

def act(a, cfg):
    if not a:
        return
    q = lambda s: urllib.parse.quote(s or "", safe="")
    para = a.get("para") or ""
    to = cfg["contacts"].get(para.lower().strip(), para)
    if a.get("tipo") == "whatsapp":
        open_url("https://wa.me/" + re.sub(r"\D", "", to) + "?text=" + q(a.get("texto")))
    elif a.get("tipo") == "email":
        open_url("mailto:" + to + "?subject=" + q(a.get("assunto")) + "&body=" + q(a.get("texto")))

# ---------------- esfera 3D ----------------
def fib(n, r):
    g, a = math.pi * (3 - math.sqrt(5)), []
    for i in range(n):
        y = 1 - 2 * (i + .5) / n
        s = math.sqrt(1 - y * y)
        a.append((math.cos(g * i) * s * r, y * r, math.sin(g * i) * s * r))
    return a

def nearest(pts, k):
    e = set()
    for i, p in enumerate(pts):
        d = sorted((sum((p[m] - q[m]) ** 2 for m in range(3)), j) for j, q in enumerate(pts) if j != i)
        for _, j in d[:k]:
            e.add((min(i, j), max(i, j)))
    return list(e)

def rot(p, ax, ay):
    x, y, z = p
    c, s = math.cos(ay), math.sin(ay)
    x, z = x * c + z * s, -x * s + z * c
    c, s = math.cos(ax), math.sin(ax)
    y, z = y * c - z * s, y * s + z * c
    return x, y, z

BG, O, O2, CORE = (5, 3, 2), (255, 122, 0), (255, 178, 90), (255, 200, 120)
SPIN = {"idle": .25, "listening": .5, "thinking": 1.9, "speaking": .7}
def shade(c, k):
    k = max(0, min(1, k))
    return "#%02x%02x%02x" % tuple(int(BG[i] + (c[i] - BG[i]) * k) for i in range(3))

# ---------------- aplicativo ----------------
class App:
    def __init__(s):
        s.cfg, s.hist = load_cfg(), []
        s.state, s.label, s.said = "idle", "TOQUE PARA INICIAR", ""
        s.busy = s.started = False
        s.t, s.spin, s.amp = 0.0, .25, 0.0
        s.out, s.inn = fib(70, 1), fib(16, .3)
        s.oe, s.ie = nearest(s.out, 3), nearest(s.inn, 3)
        s.root = tk.Tk()
        s.root.title("JARVIS"); s.root.configure(bg="#050302"); s.root.geometry("480x860")
        s.cv = tk.Canvas(s.root, bg="#050302", highlightthickness=0)
        s.cv.pack(fill="both", expand=True)
        s.cv.bind("<Button-1>", s.click)
        s.root.bind("<Escape>", lambda e: s.root.destroy())
        s.tick()

    def tick(s):
        s.t += .033
        s.spin += (SPIN[s.state] - s.spin) * .05
        if s.state == "speaking":
            tgt = (.5 + .5 * math.sin(s.t * 14)) * (.5 + .5 * math.sin(s.t * 5.3))
        elif s.state == "listening":
            tgt = .35 + .15 * math.sin(s.t * 3)
        else:
            tgt = 0
        s.amp += (tgt - s.amp) * .15
        c, W, H = s.cv, s.cv.winfo_width(), s.cv.winfo_height()
        R, cx, cy, F = min(W, H * .62) * .36 * (1 + s.amp * .08), W / 2, H * .4, 3.2
        ay, ax = s.t * s.spin, .35 + math.sin(s.t * .2) * .15
        def proj(p, k, m=1.0):
            q = rot([v * m for v in p], ax, ay * k)
            sc = F / (F - q[2] * .9)
            return cx + q[0] * R * sc, cy + q[1] * R * sc, q[2], sc, q
        po = [proj(p, 1) for p in s.out]
        pi = [proj(p, -1.7, 1 + s.amp * .25) for p in s.inn]
        c.delete("all")
        for i in range(8, 0, -1):
            r = R * (.15 + i * .16)
            c.create_oval(cx - r, cy - r, cx + r, cy + r, fill=shade(O, .015 * (9 - i) * (1 + s.amp)), outline="")
        for i, j in s.oe:
            z = (po[i][2] + po[j][2]) / 2
            c.create_line(po[i][0], po[i][1], po[j][0], po[j][1], fill=shade(O, .25 + .45 * (z + 1) / 2))
        for i, j in s.ie:
            c.create_line(pi[i][0], pi[i][1], pi[j][0], pi[j][1], fill=shade(O2, .7))
        for i, p in enumerate(po):
            b = max(range(len(pi)), key=lambda j: sum(p[4][m] * pi[j][4][m] for m in range(3)))
            pulse = .5 + .5 * math.sin(s.t * (9 if s.state == "thinking" else 2.5) - i * .4)
            c.create_line(p[0], p[1], pi[b][0], pi[b][1], fill=shade(O, .2 + .35 * pulse + s.amp * .3))
        for p in po:
            r = 2.2 * p[3]
            c.create_oval(p[0] - r, p[1] - r, p[0] + r, p[1] + r, fill=shade(O2, .4 + .6 * (p[2] + 1) / 2), outline="")
        for p in pi:
            r = 2.6 * p[3]
            c.create_oval(p[0] - r, p[1] - r, p[0] + r, p[1] + r, fill=shade(O2, 1), outline="")
        for i in range(6, 0, -1):
            r = R * .05 * i * (1 + s.amp * .5)
            c.create_oval(cx - r, cy - r, cx + r, cy + r, fill=shade(CORE, (7 - i) / 6 * .95), outline="")
        c.create_text(W / 2, H - 120, text=s.label, fill=shade(O, 1), font=("Helvetica", 11))
        c.create_text(W / 2, H - 70, text=s.said, fill="#ffd9b0", font=("Helvetica", 14),
                      width=max(200, W - 48), justify="center")
        s.root.after(33, s.tick)

    # --- fluxo de voz ---
    def click(s, e):
        if not s.started:
            s.started = True
            threading.Thread(target=s.boot, daemon=True).start()
        else:
            threading.Thread(target=s.turn, daemon=True).start()

    def boot(s):
        s.label = "SISTEMAS ONLINE"; play("boot"); time.sleep(1.3)
        s.talk("Olá, %s. Todos os sistemas estão online." % s.cfg["name"])
        if s.cfg["wake"]:
            s.wake_loop()

    def talk(s, t):
        s.said, s.state, s.label = t, "speaking", "FALANDO"
        speak(t)
        s.state, s.label = "idle", "EM ESPERA"

    def turn(s, heard=None):
        if s.busy:
            return
        s.busy = True
        try:
            if heard is None:
                play("on"); s.state, s.label = "listening", "OUVINDO"
                heard = listen(); play("off")
            if not heard:
                s.state, s.label = "idle", "EM ESPERA"
                return
            s.said = "“%s”" % heard
            if not (s.cfg["key"] and s.cfg["model"]):
                s.talk("Configure a chave e o modelo com python jarvis.py --config.")
                return
            s.state, s.label = "thinking", "PROCESSANDO"; play("think")
            r = think(heard, s.cfg, s.hist)
            s.talk(r.get("fala") or "Pronto.")
            act(r.get("acao"), s.cfg)
        except Exception as e:
            play("err"); s.state, s.label = "idle", "ERRO"
            s.said = "Falha ao falar com o modelo: %s" % e
        finally:
            s.busy = False

    def wake_loop(s):
        while s.cfg["wake"]:
            if s.busy:
                time.sleep(.5); continue
            s.label = "OUVINDO “JARVIS”"
            h = listen()
            m = re.search(r"j[áa]rvis[,\s]*(.*)", h.lower()) if h else None
            if m:
                s.turn(m.group(1).strip() or None)

if __name__ == "__main__":
    if "--config" in sys.argv or not os.path.exists(CFG_PATH):
        setup()
    build_sfx()
    App().root.mainloop()

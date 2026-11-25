// Local web app: upload text + voice + name -> preview/customize knowledge scenes & images -> render mp4.
// Run:  npm start  (or:  node server.mjs)
import express from "express";
import multer from "multer";
import {spawn} from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {generateScriptFromText} from "./scripts/split-script.mjs";
import {downloadImageToPublic, searchImages} from "./scripts/media-search.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3030;

fs.mkdirSync("tmp", {recursive: true});
fs.mkdirSync("public/audio", {recursive: true});
fs.mkdirSync("public/media", {recursive: true});
fs.mkdirSync("out", {recursive: true});

const app = express();
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "tmp/"),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
  }),
  limits: {fileSize: 50 * 1024 * 1024},
});

app.use(express.json({limit: "5mb"}));
app.use(express.urlencoded({extended: true, limit: "5mb"}));
app.use(express.static(path.join(__dirname, "pages")));
app.use("/media", express.static(path.join(__dirname, "public/media")));
app.use("/out", express.static(path.join(__dirname, "out")));

const esc = (str) => String(str ?? "").replace(/[&<>]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c]));

// ---------- main form + interactive scene editor HTML ----------
const HTML = `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reel Studio</title>
<style>
  :root { --bg:#0b0d12; --card:#161a23; --bd:#222838; --ink:#f4f6fb; --mut:#aab2c5; --acc:#FFD54A; --ok:#44d488; --err:#ff6675; --blue:#3ec5ff; }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,Segoe UI,Roboto,sans-serif;min-height:100%}
  .wrap{max-width:960px;margin:0 auto;padding:32px 20px 80px}
  h1{font-size:32px;margin:0 0 6px;letter-spacing:-.02em}
  .sub{color:var(--mut);margin-bottom:24px;font-size:15px}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:24px;margin-bottom:18px}
  label{display:block;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;font-weight:600}
  input[type=text], input[type=file], textarea{
    width:100%;background:#0f1219;color:var(--ink);border:1px solid var(--bd);
    border-radius:10px;padding:12px 14px;font:inherit;font-size:15px;outline:none
  }
  textarea{min-height:190px;line-height:1.5;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  input:focus,textarea:focus{border-color:var(--acc)}
  .hint{font-size:12px;color:var(--mut);margin-top:6px}
  .row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
  button,.btn{
    background:var(--acc);color:#1b1300;border:0;border-radius:12px;padding:13px 20px;
    font-size:15px;font-weight:800;cursor:pointer;letter-spacing:.02em;transition:transform .15s ease;text-decoration:none;display:inline-flex;align-items:center;gap:8px
  }
  button.sec,.btn.sec{background:#222838;color:#dbe0ee}
  button.ok,.btn.ok{background:var(--ok);color:#001b0e}
  button.sm{padding:8px 12px;font-size:12.5px;border-radius:9px}
  button:hover{transform:translateY(-1px)}
  button:disabled{opacity:.5;cursor:wait;transform:none}
  .counter{font-size:13px;color:var(--mut);margin-top:6px;text-align:right}
  .counter.over{color:var(--err)}
  .pill{display:inline-block;background:#222838;color:#dbe0ee;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;margin-right:6px;margin-bottom:6px}
  .footer{color:var(--mut);font-size:12px;text-align:center;margin-top:30px}
  .tagline{color:var(--acc);font-weight:700}
  .scene-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:14px}
  .sc{background:#0f1219;border:1px solid var(--bd);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
  .sc-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--mut)}
  .sc-badge{background:#1f2738;color:var(--blue);padding:3px 8px;border-radius:999px;font-weight:700;font-size:11px}
  .sc input{padding:8px 10px;font-size:13px}
  .sc-thumb{width:100%;height:140px;object-fit:cover;border-radius:10px;border:1px solid var(--bd);background:#161a23}
  .sc-visual{font-size:12px;color:#cbd5e1;background:#161a23;border-radius:8px;padding:8px 10px;border:1px solid var(--bd)}
  .thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}
  .thumbs img{width:100%;height:68px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid transparent}
  .thumbs img:hover{border-color:var(--acc)}
  .chk{display:flex;align-items:center;gap:8px;font-size:14px;color:#dbe0ee;margin:12px 0 18px;cursor:pointer}
  .chk input{width:auto}
</style>
</head>
<body>
<div class="wrap">
  <h1>🎬 <span class="tagline">Reel Studio</span></h1>
  <div class="sub">Knowledge-based medical/educational reels · Smart visual cards + Image search + Live render progress</div>

  <form id="f" method="POST" action="/render" enctype="multipart/form-data" target="status">
    <div class="card">
      <label>1. Reel ka naam</label>
      <input type="text" name="name" id="reelName" required placeholder="e.g. penis-size-facts" pattern="[a-zA-Z0-9_-]{1,60}" title="letters, numbers, _ or - only">
      <div class="hint">Sirf letters, numbers, _ aur - allowed. Output: <code>out/&lt;name&gt;.mp4</code></div>
    </div>

    <div class="card">
      <label>2. Script / Text</label>
      <textarea name="script" id="scriptBox" required placeholder="Yahan apna Hindi / Hinglish / English script paste karo. System har sentence ke meaning se Stat, Comparison, Myth vs Fact, Doctor card & image queries banayega."></textarea>
      <div class="counter" id="counter">0 chars · 0 words</div>
      <div class="hint">
        <span class="pill">📊 Stat Cards</span>
        <span class="pill">🧬 Comparison Cards</span>
        <span class="pill">❌ Myth vs ✅ Fact</span>
        <span class="pill">🩺 Doctor CTA</span>
        <span class="pill">🖼 Google / Wikimedia Images</span>
      </div>
    </div>

    <div class="card">
      <label>3. Voiceover audio (mp3 / wav / m4a / webm)</label>
      <input type="file" name="audio" id="audioFile" accept="audio/*" required>
      <div class="hint">Max 50 MB. Audio ki duration se har scene ki exact timing set hoti hai.</div>
      <label class="chk">
        <input type="checkbox" name="autoImages" value="1" id="autoImages">
        Auto-fetch images for scenes without data cards (Google CSE / Pexels / Wikimedia)
      </label>
      <div class="row">
        <button id="previewBtn" type="button" class="sec">🔍 Step 1: Preview & Edit Scenes / Images</button>
        <button id="go" type="submit">⚡ Direct Render MP4</button>
        <a href="/out/" target="_blank" class="btn sec">📁 All Renders</a>
      </div>
    </div>
  </form>

  <div id="editorSection" class="card" style="display:none">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="margin:0;font-size:20px">🧩 Scene Storyboard Editor</h2>
        <div class="hint" id="editorMeta"></div>
      </div>
      <button id="renderEditedBtn" type="button" class="ok">🚀 Render Customized Reel</button>
    </div>
    <div id="sceneGrid" class="scene-grid"></div>
  </div>

  <form id="editedForm" method="POST" action="/render-edited" target="status" style="display:none">
    <input type="hidden" name="name" id="editedName">
    <input type="hidden" name="scriptJson" id="editedJson">
  </form>

  <div id="result" style="margin-top:24px"></div>
  <iframe name="status" id="statusFrame" style="display:none;width:100%;height:560px;border:0;margin-top:18px;border-radius:14px;background:#0a0d14"></iframe>

  <div class="footer">Local-only · Port ${PORT} · <code>npm start</code></div>
</div>

<script>
  const ta = document.getElementById('scriptBox');
  const c = document.getElementById('counter');
  const update = () => {
    const t = ta.value;
    c.textContent = t.length + ' chars · ' + (t.trim().split(/\\s+/).filter(Boolean).length) + ' words';
    c.classList.toggle('over', t.length > 4000);
  };
  ta.addEventListener('input', update);
  update();

  const f = document.getElementById('f');
  const go = document.getElementById('go');
  const previewBtn = document.getElementById('previewBtn');
  const editorSection = document.getElementById('editorSection');
  const editorMeta = document.getElementById('editorMeta');
  const sceneGrid = document.getElementById('sceneGrid');
  const renderEditedBtn = document.getElementById('renderEditedBtn');
  const result = document.getElementById('result');
  const statusFrame = document.getElementById('statusFrame');

  let currentData = null;

  function startRenderUI() {
    go.disabled = true;
    renderEditedBtn.disabled = true;
    go.textContent = '⏳ Render chal raha hai...';
    result.innerHTML = '<div class="card"><div class="sub" style="margin:0">Niche status + progress bar dikhega. Ye tab band mat karo — render chal raha hai...</div></div>';
    statusFrame.style.display = 'block';
    statusFrame.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }

  f.addEventListener('submit', startRenderUI);

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.done) {
      go.disabled = false;
      renderEditedBtn.disabled = false;
      go.textContent = '⚡ Direct Render MP4';
      if (m.ok && m.url) {
        result.innerHTML = '<div class="card" style="border-color:rgba(68,212,136,.45)">'
          + '<div style="font-weight:800;font-size:18px;color:var(--ok);margin-bottom:8px">✅ Reel ready!</div>'
          + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
          + '<a href="' + m.url + '" download class="btn ok">⬇ Download MP4</a>'
          + '<a href="' + m.url + '" target="_blank" rel="noopener" class="btn">▶ Open Video</a>'
          + '<a href="/out/" target="_blank" class="btn sec">📁 All Renders</a>'
          + '</div></div>';
      } else {
        result.innerHTML = '<div class="card" style="border-color:rgba(255,102,117,.45)"><div style="font-weight:800;color:var(--err)">❌ Render failed — niche log dekho</div></div>';
      }
    }
  });

  function describeVisual(s) {
    if (s.image) return '🖼 Custom Image: ' + s.image;
    const v = s.visual || {};
    if (v.kind === 'stat') return '📊 Stat Card: ' + v.label + ' → ' + v.value;
    if (v.kind === 'compare') return '🧬 Compare: ' + v.leftTitle + ' vs ' + v.rightTitle;
    if (v.kind === 'myth') return '❌ Myth vs ✅ Fact';
    if (v.kind === 'bullets') return '✔ Bullets (' + (v.items || []).length + ' items)';
    if (v.kind === 'doctor') return '🩺 Doctor Card: ' + v.name;
    return s.emoji + ' Icon Card';
  }

  function renderEditor() {
    if (!currentData) return;
    editorSection.style.display = 'block';
    editorMeta.textContent = currentData.scenes.length + ' scenes · ' + currentData.totalDuration.toFixed(2) + 's total · Edit titles, captions, or pick/upload images';
    sceneGrid.innerHTML = '';

    currentData.scenes.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = 'sc';
      card.innerHTML =
        '<div class="sc-head"><b>Scene ' + (idx + 1) + ' · ' + s.duration.toFixed(1) + 's</b>'
        + '<span class="sc-badge">' + (s.visual?.kind || 'icon').toUpperCase() + '</span></div>'
        + '<input type="text" data-k="tag" placeholder="Tag">'
        + '<input type="text" data-k="title" placeholder="Title">'
        + '<input type="text" data-k="caption" placeholder="Caption (*word* = highlight)">'
        + '<div class="sc-visual">' + describeVisual(s) + '</div>'
        + (s.image ? '<img class="sc-thumb" src="/' + s.image.replace(/^\\/+/, '') + '">' : '')
        + '<div class="row" style="gap:6px">'
        + '<input type="text" data-k="imageQuery" placeholder="Image search query" style="flex:1">'
        + '<button type="button" class="sec sm" data-act="search">🔍 Search</button>'
        + '</div>'
        + '<div class="row" style="gap:6px">'
        + '<label class="btn sec sm" style="margin:0;cursor:pointer">📤 Upload Photo<input type="file" accept="image/*" style="display:none" data-act="upload"></label>'
        + (s.image ? '<button type="button" class="sec sm" data-act="clear">✖ Use Card</button>' : '')
        + '</div>'
        + '<div class="thumbs" data-thumbs></div>';

      card.querySelector('[data-k="tag"]').value = s.tag || '';
      card.querySelector('[data-k="title"]').value = s.title || '';
      card.querySelector('[data-k="caption"]').value = s.caption || '';
      card.querySelector('[data-k="imageQuery"]').value = s.imageQuery || '';

      card.querySelectorAll('input[data-k]').forEach(inp => {
        inp.addEventListener('input', () => { s[inp.dataset.k] = inp.value; });
      });

      const thumbsDiv = card.querySelector('[data-thumbs]');
      card.querySelector('[data-act="search"]').addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        const q = card.querySelector('[data-k="imageQuery"]').value || s.title;
        btn.disabled = true; btn.textContent = '...';
        thumbsDiv.innerHTML = '';
        try {
          const r = await fetch('/api/images?q=' + encodeURIComponent(q));
          const j = await r.json();
          if (!j.results || !j.results.length) {
            thumbsDiv.innerHTML = '<div class="hint" style="grid-column:1/-1">No images found — try simpler English keywords</div>';
          } else {
            j.results.forEach(item => {
              const img = document.createElement('img');
              img.src = item.thumb;
              img.title = item.title + ' (' + item.source + ')';
              img.addEventListener('click', async () => {
                btn.disabled = true; btn.textContent = 'Saving...';
                const ur = await fetch('/api/use-image', {
                  method: 'POST',
                  headers: {'content-type': 'application/json'},
                  body: JSON.stringify({url: item.url, sceneIndex: idx}),
                });
                const uj = await ur.json();
                if (uj.ok) {
                  s.image = uj.image;
                  renderEditor();
                } else {
                  alert(uj.error || 'Failed to save image');
                  btn.disabled = false; btn.textContent = '🔍 Search';
                }
              });
              thumbsDiv.appendChild(img);
            });
          }
        } catch (err) {
          thumbsDiv.innerHTML = '<div class="hint" style="grid-column:1/-1">Search failed</div>';
        }
        btn.disabled = false; btn.textContent = '🔍 Search';
      });

      card.querySelector('[data-act="upload"]').addEventListener('change', async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('image', file);
        const ur = await fetch('/api/upload-image', {method: 'POST', body: fd});
        const uj = await ur.json();
        if (uj.ok) {
          s.image = uj.image;
          renderEditor();
        } else {
          alert(uj.error || 'Upload failed');
        }
      });

      const clr = card.querySelector('[data-act="clear"]');
      if (clr) clr.addEventListener('click', () => { delete s.image; renderEditor(); });

      sceneGrid.appendChild(card);
    });
  }

  previewBtn.addEventListener('click', async () => {
    const audioEl = document.getElementById('audioFile');
    if (!ta.value.trim()) return alert('Script paste karo pehle');
    if (!audioEl.files?.[0]) return alert('Voiceover audio select karo pehle');
    previewBtn.disabled = true;
    previewBtn.textContent = '⏳ Analyzing scenes...';
    try {
      const fd = new FormData();
      fd.append('script', ta.value);
      fd.append('audio', audioEl.files[0]);
      if (document.getElementById('autoImages').checked) fd.append('autoImages', '1');
      const r = await fetch('/api/prepare', {method: 'POST', body: fd});
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Prepare failed');
      currentData = j.data;
      renderEditor();
      editorSection.scrollIntoView({behavior: 'smooth'});
    } catch (err) {
      alert(err.message);
    } finally {
      previewBtn.disabled = false;
      previewBtn.textContent = '🔍 Step 1: Preview & Edit Scenes / Images';
    }
  });

  renderEditedBtn.addEventListener('click', () => {
    if (!currentData) return;
    const nameInput = document.getElementById('reelName');
    const name = (nameInput.value || 'reel').trim();
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(name)) {
      nameInput.focus();
      return alert('Valid reel name daalo (letters, numbers, _ or -)');
    }
    document.getElementById('editedName').value = name;
    document.getElementById('editedJson').value = JSON.stringify(currentData);
    startRenderUI();
    document.getElementById('editedForm').submit();
  });
</script>
</body>
</html>
`;

// ---------- progress iframe HTML ----------
const STATUS_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Rendering...</title>
<style>
  :root { --bg:#0b0d12; --card:#161a23; --bd:#222838; --ink:#f4f6fb; --mut:#aab2c5; --acc:#FFD54A; --ok:#44d488; --err:#ff6675; }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,sans-serif;padding:22px;height:100%}
  h2{margin:0 0 12px;font-size:18px;display:flex;align-items:center;gap:8px}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#222838;color:#dbe0ee}
  .badge.run{background:rgba(255,213,74,.15);color:var(--acc)}
  .badge.ok{background:rgba(68,212,136,.18);color:var(--ok)}
  .badge.err{background:rgba(255,102,117,.18);color:var(--err)}
  .bar{margin-top:14px;height:14px;background:#1a1f2c;border-radius:8px;overflow:hidden;border:1px solid var(--bd);position:relative}
  .bar .fill{height:100%;background:linear-gradient(90deg,#FFD54A,#ff9b3a);width:0%;transition:width .3s ease;border-radius:8px}
  .bar.err .fill{background:linear-gradient(90deg,#ff6675,#a83a48)}
  .stats{display:flex;justify-content:space-between;font:12px ui-monospace,monospace;color:var(--mut);margin-top:6px}
  .stats .pct{color:var(--acc);font-weight:700;font-size:14px}
  .stats.err .pct{color:var(--err)}
  .log{font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfd5e6;background:#0a0d14;border-radius:10px;padding:12px;margin-top:14px;max-height:340px;overflow:auto;white-space:pre-wrap;flex:1;border:1px solid var(--bd)}
  .log .ok{color:var(--ok)}.log .err{color:var(--err);background:rgba(255,102,117,.07);padding:2px 4px;border-radius:3px;display:inline-block}.log .b{color:var(--acc);font-weight:700}
  .err-big{display:none;margin-top:14px;padding:14px 16px;background:rgba(255,102,117,.10);border:1px solid rgba(255,102,117,.4);border-radius:10px;color:var(--err);font:13px ui-monospace,monospace;white-space:pre-wrap}
  .err-big.shown{display:block}
  a.dl{display:inline-block;margin-top:14px;background:var(--ok);color:#001b0e;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px}
  a.dl.acc{background:var(--acc);color:#1b1300;margin-left:8px}
</style></head><body>
<h2><span id="t">⏳ Rendering...</span><span id="badge" class="badge run">in progress</span></h2>
<div class="bar" id="bar"><div class="fill" id="fill"></div></div>
<div class="stats" id="stats"><span class="pct" id="pct">0%</span><span id="frame">frame 0 / 0</span><span id="eta">—</span></div>
<div class="log" id="log"></div>
<div class="err-big" id="errbig"></div>
<div id="end"></div>
<script>
  const log = document.getElementById('log');
  const t = document.getElementById('t');
  const badge = document.getElementById('badge');
  const bar = document.getElementById('bar');
  const fill = document.getElementById('fill');
  const pctEl = document.getElementById('pct');
  const frameEl = document.getElementById('frame');
  const etaEl = document.getElementById('eta');
  const errbig = document.getElementById('errbig');
  const end = document.getElementById('end');

  let lastErr = '';
  function append(text, cls) {
    if (!text) return;
    const div = document.createElement('div');
    div.innerHTML = text;
    if (cls) div.className = cls;
    log.appendChild(div);
    while (log.childElementCount > 150) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
    if (cls === 'err') {
      lastErr = (lastErr + '\\n' + text).slice(-2000);
      errbig.textContent = lastErr;
      errbig.classList.add('shown');
    }
  }
  function handleMsg(m) {
    m = m || {};
    if (m.text !== undefined) append(m.text, m.cls || '');
    if (m.progress) {
      const {frame, total, pct, eta, phase} = m.progress;
      fill.style.width = pct + '%';
      pctEl.textContent = pct + '%';
      frameEl.textContent = (phase || 'frame') + ' ' + frame.toLocaleString() + ' / ' + total.toLocaleString();
      etaEl.textContent = eta || '—';
    }
    if (m.done) {
      t.textContent = m.ok ? '✅ Done — MP4 ready' : '❌ Render failed';
      badge.textContent = m.ok ? 'success' : 'failed';
      badge.className = 'badge ' + (m.ok ? 'ok' : 'err');
      bar.classList.toggle('err', !m.ok);
      if (m.ok) {
        fill.style.width = '100%'; pctEl.textContent = '100%'; etaEl.textContent = 'done';
        if (m.url) end.innerHTML = '<a class="dl" href="' + m.url + '" target="_top" rel="noopener">⬇ Download / Open MP4</a>'
                                 + '<a class="dl acc" href="/out/" target="_top">📁 All Renders</a>';
      } else {
        end.innerHTML = '<a class="dl acc" href="/out/" target="_top">📁 See output folder</a>';
      }
    }
  }
  window.__onMsg = handleMsg;
  window.addEventListener('message', (e) => handleMsg(e.data));
</script></body></html>`;

function saveUploadedAudio(file) {
  const rawExt = path.extname(file?.originalname || "").toLowerCase();
  const ext = /^\.[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : ".mp3";
  for (const f of fs.readdirSync("public/audio")) {
    if (f.startsWith("voiceover.")) fs.unlinkSync(path.join("public/audio", f));
  }
  const voiceoverPublicPath = `audio/voiceover${ext}`;
  const targetAudio = `public/${voiceoverPublicPath}`;
  fs.copyFileSync(file.path, targetAudio);
  return {targetAudio, voiceoverPublicPath};
}

async function attachAutoImages(data) {
  for (let i = 0; i < data.scenes.length; i++) {
    const s = data.scenes[i];
    if (s.image || (s.visual && s.visual.kind !== "emoji")) continue;
    if (!s.imageQuery) continue;
    try {
      const hits = await searchImages(s.imageQuery, 2);
      if (hits[0]?.url) {
        s.image = await downloadImageToPublic(hits[0].url, `auto-${i}`);
      }
    } catch {
      // keep icon/card fallback
    }
  }
}

function streamRemotionRender(name, data, res) {
  const sLog = (...a) => console.log("[render]", ...a);
  const send = (msg) => {
    const json = JSON.stringify(msg);
    res.write(`<script>window.__onMsg&&window.__onMsg(${json});parent.postMessage(${json}, '*');</script>`);
  };

  send({text: `✓ Using <span class="b">${data.scenes.length}</span> scenes · total <span class="b">${data.totalDuration.toFixed(2)}s</span>`, cls: "ok"});
  for (const s of data.scenes) {
    const mode = s.image ? "IMG" : (s.visual?.kind || "icon").toUpperCase();
    send({text: `  · <span class="b">${s.duration.toFixed(1)}s</span> [${esc(mode)}] ${esc(s.title)} :: ${esc(s.caption)}`});
  }

  const outFile = `out/${name}.mp4`;
  send({text: `\n▶ Rendering video → <span class="b">${outFile}</span>\n`});
  sLog("spawning remotion render ->", outFile);

  const isWin = process.platform === "win32";
  const localBin = path.join(__dirname, "node_modules", ".bin", isWin ? "remotion.cmd" : "remotion");
  const proc = spawn(localBin, ["render", "src/index.ts", "Reel", outFile, "--log=info", "--concurrency=1"], {
    cwd: __dirname,
    env: {...process.env, FORCE_COLOR: "0"},
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWin,
  });

  let stdoutBuf = ""; let stderrBuf = "";
  const flushLine = (buf, isErr) => {
    const lines = buf.split(/\r?\n/);
    const tail = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      sLog(isErr ? "ERR> " : "OUT> ", line.slice(0, 200));
      const m = line.match(/Rendered\s+(\d+)\/(\d+)(?:,\s*time remaining:\s*([^,\r\n]+))?/);
      const enc = !m && line.match(/Encoded\s+(\d+)\/(\d+)/);
      if (m) {
        const frame = +m[1], total = +m[2], eta = m[3]?.trim();
        const pct = total ? Math.min(99, Math.round(100 * frame / total)) : 0;
        send({progress: {frame, total, pct, eta, phase: "frame"}});
      } else if (enc) {
        const frame = +enc[1], total = +enc[2];
        const pct = total ? Math.min(99, Math.round(100 * frame / total)) : 99;
        send({progress: {frame, total, pct, eta: "encoding MP4...", phase: "encoded"}});
      }
      send({text: esc(line), cls: isErr ? "err" : ""});
    }
    return tail;
  };

  proc.stdout.on("data", d => { stdoutBuf = flushLine(stdoutBuf + d.toString(), false); });
  proc.stderr.on("data", d => { stderrBuf = flushLine(stderrBuf + d.toString(), true); });

  proc.on("error", err => {
    sLog("proc error:", err.message);
    send({text: `✗ Spawn error: ${esc(err.message)}`, cls: "err"});
    send({done: true, ok: false});
    res.end();
  });

  proc.on("close", code => {
    if (stdoutBuf.trim()) send({text: esc(stdoutBuf)});
    if (stderrBuf.trim()) send({text: esc(stderrBuf), cls: "err"});
    sLog("proc closed with code:", code);
    if (code === 0) {
      try {
        const size = fs.statSync(outFile).size;
        const mb = (size / 1024 / 1024).toFixed(2);
        send({text: `\n✅ Done! File: <span class="b">${outFile}</span> (${mb} MB)`, cls: "ok"});
        send({text: `<a class="dl" href="/${outFile}" target="_top" rel="noopener">⬇ Open MP4</a>`});
        send({done: true, ok: true, url: `/${outFile}`});
      } catch (e) {
        send({text: `\n⚠ Render finished but output file missing: ${esc(e.message)}`, cls: "err"});
        send({done: true, ok: false});
      }
    } else {
      const extra = code === null ? " (process killed)" : "";
      send({text: `\n❌ Render failed with exit code ${code}${extra}`, cls: "err"});
      send({done: true, ok: false});
    }
    res.end();
  });
}

// ---------- routes ----------
app.get("/", (req, res) => res.send(HTML));

app.get("/out/", (req, res) => {
  const files = fs.readdirSync(path.join(__dirname, "out"))
    .filter(f => /\.(mp4|mov|webm)$/i.test(f))
    .map(f => {
      const st = fs.statSync(path.join(__dirname, "out", f));
      return {name: f, mb: (st.size / 1024 / 1024).toFixed(2), mtime: st.mtimeMs};
    })
    .sort((a, b) => b.mtime - a.mtime);
  const rows = files.map(f => `<li style="margin:10px 0"><a href="/out/${encodeURIComponent(f.name)}" style="color:#FFD54A;font-weight:700">${esc(f.name)}</a> <span style="color:#aab2c5">(${f.mb} MB)</span></li>`).join("");
  res.send(`<!doctype html><html><body style="background:#0b0d12;color:#f4f6fb;font-family:system-ui,sans-serif;padding:32px;max-width:720px;margin:0 auto"><h1>📁 Rendered Reels</h1><ul>${rows || "<li>No renders yet</li>"}</ul><p><a href="/" style="color:#44d488">← Back to Reel Studio</a></p></body></html>`);
});

app.get("/api/images", async (req, res) => {
  try {
    const results = await searchImages(String(req.query.q || ""), 6);
    res.json({ok: true, results});
  } catch (e) {
    res.status(500).json({ok: false, error: e.message});
  }
});

app.post("/api/use-image", async (req, res) => {
  try {
    const {url, sceneIndex} = req.body || {};
    const image = await downloadImageToPublic(url, `scene-${Number(sceneIndex) || 0}`);
    res.json({ok: true, image});
  } catch (e) {
    res.status(400).json({ok: false, error: e.message});
  }
});

app.post("/api/upload-image", upload.single("image"), (req, res) => {
  try {
    if (!req.file) throw new Error("No image file uploaded");
    const ext = path.extname(req.file.originalname || ".jpg").toLowerCase() || ".jpg";
    const filename = `custom-${Date.now()}${/^\.[a-z0-9]{2,5}$/.test(ext) ? ext : ".jpg"}`;
    fs.copyFileSync(req.file.path, path.join("public/media", filename));
    res.json({ok: true, image: `media/${filename}`});
  } catch (e) {
    res.status(400).json({ok: false, error: e.message});
  }
});

app.post("/api/prepare", upload.single("audio"), async (req, res) => {
  try {
    const scriptText = req.body.script || "";
    if (!req.file?.path) throw new Error("Audio file missing");
    if (!scriptText.trim()) throw new Error("Script text missing");
    const {targetAudio, voiceoverPublicPath} = saveUploadedAudio(req.file);
    const data = generateScriptFromText(scriptText, targetAudio, voiceoverPublicPath);
    if (req.body.autoImages === "1") await attachAutoImages(data);
    fs.writeFileSync("src/data/script.json", JSON.stringify(data, null, 2));
    res.json({ok: true, data});
  } catch (e) {
    res.status(400).json({ok: false, error: e.message});
  }
});

app.post("/render", upload.single("audio"), async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.write(STATUS_PAGE);
  res.flushHeaders?.();
  const send = (msg) => {
    const json = JSON.stringify(msg);
    res.write(`<script>window.__onMsg&&window.__onMsg(${json});parent.postMessage(${json}, '*');</script>`);
  };
  try {
    const name = (req.body.name || "reel").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "reel";
    const scriptText = req.body.script || "";
    if (!req.file?.path) throw new Error("Audio file missing");
    if (!scriptText.trim()) throw new Error("Script text missing");

    send({text: `▶ Saving audio & analyzing content...`});
    const {targetAudio, voiceoverPublicPath} = saveUploadedAudio(req.file);
    const data = generateScriptFromText(scriptText, targetAudio, voiceoverPublicPath);
    if (req.body.autoImages === "1") {
      send({text: `🖼 Fetching relevant images for scenes...`});
      await attachAutoImages(data);
    }
    fs.writeFileSync("src/data/script.json", JSON.stringify(data, null, 2));
    streamRemotionRender(name, data, res);
  } catch (e) {
    send({text: `\n❌ ${esc(e.message)}`, cls: "err"});
    send({done: true, ok: false});
    res.end();
  }
});

app.post("/render-edited", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.write(STATUS_PAGE);
  res.flushHeaders?.();
  const send = (msg) => {
    const json = JSON.stringify(msg);
    res.write(`<script>window.__onMsg&&window.__onMsg(${json});parent.postMessage(${json}, '*');</script>`);
  };
  try {
    const name = (req.body.name || "reel").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "reel";
    const data = JSON.parse(req.body.scriptJson || "{}");
    if (!Array.isArray(data.scenes) || data.scenes.length === 0) throw new Error("No scenes to render");
    fs.writeFileSync("src/data/script.json", JSON.stringify(data, null, 2));
    streamRemotionRender(name, data, res);
  } catch (e) {
    send({text: `\n❌ ${esc(e.message)}`, cls: "err"});
    send({done: true, ok: false});
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n  ⚡ Reel Studio UI ready → http://localhost:${PORT}\n`);
});

// Splits Hindi/Hinglish/English script text into balanced scenes with content-aware
// knowledge visuals, accurate titles/tags, and audio-synced durations.
import path from "node:path";
import fs from "node:fs";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const FFPROBE = ffprobeInstaller?.path;

const THEMES = {
  navy: ["#1d3b66", "#061124"],
  teal: ["#0d5c63", "#041c24"],
  indigo: ["#312e81", "#0c0a26"],
  amber: ["#7a4a00", "#1e1200"],
  crimson: ["#7f1d1d", "#240507"],
  emerald: ["#065f46", "#022018"],
};

function splitWords(s) { return s.trim().split(/\s+/).filter(Boolean); }

// Pick a balanced cut at word boundary. Tries comma / semicolon first,
// then nearest word space.
function findWordCut(s, mid) {
  for (let r = 6; r <= 30; r += 4) {
    for (const c of [",", ";", "—"]) {
      const idx = s.indexOf(c + (c === "—" ? "" : " "), mid);
      if (idx > -1 && idx > mid - r && idx < mid + r) return idx + c.length + (c === "—" ? 0 : 1);
    }
  }
  for (let r = 1; r < s.length; r++) {
    if (mid + r < s.length && /\s/.test(s[mid + r])) return mid + r + 1;
    if (mid - r > 0 && /\s/.test(s[mid - r])) return mid - r + 1;
  }
  return mid;
}

export function splitIntoScenes(text, totalSeconds, opts = {}) {
  const safeTotal = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 30;
  const minScenes = opts.min ?? 7;
  const maxScenes = opts.max ?? Math.max(18, Math.ceil(safeTotal / 5.5));
  const minDuration = opts.minDuration ?? 2.4;
  const minCaptionWords = opts.minCaptionWords ?? 4;

  // 1. Split into sentences on Hindi danda, ?, !, newline, AND on '.' when NOT a decimal or title (Dr., Mr., Ms., Mrs.)
  let sentences = text
    .split(/(?<!\d)(?<!\bDr)(?<!\bMr)(?<!\bMs)(?<!\bMrs)[।.!?]+(?=\s+|$)|[\n\r]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [];

  // 2. Only split very long sentences (> 21 words) unless we need to reach minScenes
  const target = Math.min(maxScenes, Math.max(minScenes, sentences.length));
  let pass = 0;
  while (sentences.length < maxScenes && pass < 24) {
    pass++;
    const longest = sentences
      .map((s, i) => ({s, i, w: splitWords(s).length}))
      .filter(x => x.w >= (sentences.length < target ? (minCaptionWords * 2) + 2 : 22))
      .sort((a, b) => b.w - a.w)[0];
    if (!longest) break;

    const {s, i: idx} = longest;
    const mid = Math.floor(s.length / 2);
    const cut = findWordCut(s, mid);
    const a = s.slice(0, cut).trim().replace(/[,\s—]+$/, "");
    const b = s.slice(cut).trim().replace(/^[,\s—]+/, "");
    if (!a || !b) break;
    sentences.splice(idx, 1, a, b);
  }

  // 3. Rebind: any scene < minCaptionWords → merge with neighbour
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (splitWords(sentences[i]).length < minCaptionWords) {
      if (i + 1 < sentences.length) {
        sentences[i] = (sentences[i] + " " + sentences[i + 1]).trim();
        sentences.splice(i + 1, 1);
      } else if (i > 0) {
        sentences[i - 1] = (sentences[i - 1] + " " + sentences[i]).trim();
        sentences.splice(i, 1);
      }
    }
  }

  // 4. If still over maxScenes, merge shortest neighbour pair
  while (sentences.length > maxScenes) {
    const idx = sentences.reduce((m, s, i, a) => s.length < a[m].length ? i : m, 0);
    const partner = idx === sentences.length - 1 ? idx - 1 : idx + 1;
    const lo = Math.min(idx, partner);
    sentences.splice(lo, 2, (sentences[lo] + " " + sentences[lo + 1]).trim());
  }

  // 5. Allocate durations proportional to character count, guaranteed positive and summing to safeTotal
  const effectiveMin = Math.min(minDuration, Math.max(0.5, (safeTotal * 0.6) / sentences.length));
  const totalChars = Math.max(1, sentences.reduce((a, s) => a + s.length, 0));
  let durations = sentences.map(s => Math.max(effectiveMin, (s.length / totalChars) * safeTotal));
  const sum = durations.reduce((a, x) => a + x, 0);
  const factor = safeTotal / sum;
  durations = durations.map(d => Math.max(0.5, Math.round(d * factor * 10) / 10));

  let diff = Math.round((safeTotal - durations.reduce((a, x) => a + x, 0)) * 10) / 10;
  for (let i = durations.length - 1; i >= 0 && Math.abs(diff) >= 0.05; i--) {
    const next = Math.round((durations[i] + diff) * 10) / 10;
    if (next >= 0.5) {
      durations[i] = next;
      diff = 0;
    } else {
      const taken = Math.round((0.5 - durations[i]) * 10) / 10;
      durations[i] = 0.5;
      diff = Math.round((diff - taken) * 10) / 10;
    }
  }

  return sentences.map((text, i) => ({text, duration: durations[i]}));
}

function pickHighlight(text) {
  const words = text
    .replace(/[.,;:?!।\-\u2013\u2014"'()\[\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return text;
  const candidates = words.filter(w => [...w].length >= 3 && !/^\d+$/.test(w));
  if (candidates.length === 0) return words[0];
  candidates.sort((a, b) => {
    const score = w => (w.length * 2) + (/[A-Za-z]/.test(w) ? 2 : 0);
    return score(b) - score(a);
  });
  return candidates[0];
}

function buildCaption(text) {
  const all = text.split(/\s+/).filter(Boolean);
  const head = all.slice(0, 24).join(" ");
  if (!head) return "";
  const star = pickHighlight(head);
  return head.replace(star, `*${star}*`);
}

function extractEnglishQuery(text, fallback) {
  const stop = new Set(["the", "and", "for", "with", "this", "that", "from", "are", "you", "your", "normal", "size", "hai", "nahi", "kya", "mein", "aur"]);
  const words = (text.match(/[A-Za-z]{3,}/g) || [])
    .map(w => w.toLowerCase())
    .filter(w => !stop.has(w));
  const unique = [...new Set(words)].slice(0, 3);
  return unique.length ? `${unique.join(" ")} medical health` : fallback;
}

function deriveFallbackTitle(text) {
  const latin = (text.match(/[A-Za-z0-9.%+-]{3,}/g) || []).filter(w => !/^(the|and|for|with|this|that|from)$/i.test(w));
  if (latin.length >= 2) return `${latin[0]} ${latin[1]}`.slice(0, 20).toUpperCase();
  if (latin.length === 1) return latin[0].slice(0, 18).toUpperCase();
  return splitWords(text).slice(0, 3).join(" ").slice(0, 22).toUpperCase() || "KEY FACT";
}

function analyzeSceneContent(text, i, totalScenes) {
  const t = text.trim();

  // 1. Named doctor / specialist intro (e.g., "मैं हूँ Dr. Vinod Raina, Sexologist")
  const drMatch = t.match(/\b(Dr\.?\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,2})/i);
  if (drMatch) {
    const drName = drMatch[1].replace(/\s+/g, " ").trim();
    const roleMatch = t.match(/\b(Sexologist|Urologist|Andrologist|Doctor|Specialist|Physician|Surgeon|Dermatologist)\b/i);
    const role = roleMatch ? roleMatch[1] : "Medical Specialist";
    return {
      tag: "EXPERT",
      title: drName.toUpperCase(),
      emoji: "🩺",
      colors: THEMES.emerald,
      imageQuery: "doctor portrait stethoscope medical clinic",
      visual: {kind: "doctor", name: drName, role, cta: "Qualified Medical Advice"},
    };
  }

  // 2. Appointment / Consultation CTA / Confusion
  if (/\b(appointment|dm|consult|book|contact|call)\b|मुझसे मिलें|संपर्क/i.test(t)) {
    return {
      tag: "CONSULTATION",
      title: "BOOK APPOINTMENT",
      emoji: "📩",
      colors: THEMES.emerald,
      imageQuery: "doctor consultation clinic appointment",
      visual: {kind: "doctor", name: "PRIVATE CONSULTATION", role: "Confidential Medical Care", cta: "DM FOR APPOINTMENT"},
    };
  }
  if (/confusion|परेशानी/i.test(t)) {
    return {
      tag: "GET CLARITY",
      title: "SEEK EXPERT HELP",
      emoji: "🩺",
      colors: THEMES.teal,
      imageQuery: "doctor talking patient medical consultation",
      visual: {kind: "doctor", name: "HAVE QUESTIONS?", role: "Don't Guess — Get Real Answers", cta: "CONSULT A SPECIALIST"},
    };
  }

  // 3. Adult film / extreme size myth
  if (/(adult|porn|फिल्म|extreme)/i.test(t)) {
    return {
      tag: "MYTH BUSTED",
      title: "SCREEN vs REALITY",
      emoji: "🚫",
      colors: THEMES.crimson,
      imageQuery: "fact versus myth medical science",
      visual: {kind: "myth", myth: "8–9 inch (Adult Films)", fact: "5.2 inch (Medical Average)"},
    };
  }

  // 4. Measurement / Numeric stat (e.g. "3.6 inch", "5.2 inch", "50%")
  const statMatch = t.match(/(\d+(?:\.\d+)?)\s*(inch|inches|cm|mm|%|kg|mg|hrs?|hours?|mins?|minutes?|days?|years?|साल|इंच)/i);
  if (statMatch) {
    const val = `${statMatch[1]} ${statMatch[2].toLowerCase()}`;
    if (/flaccid|normal हालत/i.test(t)) {
      return {
        tag: "MEASUREMENT",
        title: `FLACCID: ${statMatch[1]} INCH`,
        emoji: "📏",
        colors: THEMES.navy,
        imageQuery: "medical measurement ruler science",
        visual: {kind: "stat", label: "FLACCID AVERAGE", value: val, sub: "Normal resting state"},
      };
    }
    if (/erect|erection/i.test(t)) {
      return {
        tag: "MEASUREMENT",
        title: `ERECT: ${statMatch[1]} INCH`,
        emoji: "📊",
        colors: THEMES.teal,
        imageQuery: "medical research data chart",
        visual: {kind: "stat", label: "ERECT AVERAGE", value: val, sub: "Erected state average"},
      };
    }
    return {
      tag: "DATA FACT",
      title: `${statMatch[1]} ${statMatch[2].toUpperCase()}`,
      emoji: "📊",
      colors: THEMES.navy,
      imageQuery: extractEnglishQuery(t, "medical data research"),
      visual: {kind: "stat", label: "CLINICAL STAT", value: val},
    };
  }

  // 5. Growers & Showers comparison
  if (/grower/i.test(t) && /shower/i.test(t)) {
    return {
      tag: "ANATOMY",
      title: "GROWERS vs SHOWERS",
      emoji: "🧬",
      colors: THEMES.indigo,
      imageQuery: "human biology medical illustration",
      visual: {
        kind: "compare",
        leftTitle: "GROWERS",
        leftText: "Smaller resting size, grows noticeably when erect",
        rightTitle: "SHOWERS",
        rightText: "Larger resting size, smaller change when erect",
      },
    };
  }
  if (/grower/i.test(t) || (/छोटा दिखाई/i.test(t) && /बढ़ जाता/i.test(t)) || /काफी बढ़ जाता/i.test(t)) {
    return {
      tag: "PATTERN 1",
      title: "GROWERS",
      emoji: "📈",
      colors: THEMES.teal,
      imageQuery: "growth chart medical science",
      visual: {kind: "stat", label: "GROWERS PATTERN", value: "HIGH EXPANSION", sub: "Smaller resting size, grows more when erect"},
    };
  }
  if (/shower/i.test(t) || (/बड़ा दिखाई/i.test(t) && /बदलाव/i.test(t)) || /comparatively कम/i.test(t)) {
    return {
      tag: "PATTERN 2",
      title: "SHOWERS",
      emoji: "📊",
      colors: THEMES.navy,
      imageQuery: "medical comparison chart",
      visual: {kind: "stat", label: "SHOWERS PATTERN", value: "STEADY SIZE", sub: "Larger resting size, modest erect change"},
    };
  }

  // 6. Viewing angle / perspective
  if (/judge मत/i.test(t)) {
    return {
      tag: "PERSPECTIVE",
      title: "DON'T SELF-JUDGE",
      emoji: "👀",
      colors: THEMES.amber,
      imageQuery: "mirror perspective optical illusion",
      visual: {kind: "myth", myth: "Judging from a top-down glance", fact: "Eye-level view shows true proportion"},
    };
  }
  if (/viewing angle|ऊपर से नीचे|पेट की वजह|angle से/i.test(t)) {
    return {
      tag: "PERCEPTION",
      title: "VIEWING ANGLE",
      emoji: "📐",
      colors: THEMES.amber,
      imageQuery: "optical perspective angle measurement",
      visual: {kind: "myth", myth: "Looking straight down", fact: "Angle makes it look smaller"},
    };
  }

  // 7. Key multi-factor health bullets
  if (/comfort|communication|intimacy/i.test(t)) {
    return {
      tag: "WHAT MATTERS",
      title: "REAL SATISFACTION",
      emoji: "❤️",
      colors: THEMES.teal,
      imageQuery: "couple wellness relationship communication",
      visual: {kind: "bullets", items: ["Comfort & Trust", "Open Communication", "Emotional Intimacy", "Good Sexual Health"]},
    };
  }

  // 8. Medical study / clinical measurement
  if (/डॉक्टरों|medical measurement|medical study|research|study|result/i.test(t)) {
    return {
      tag: "MEDICAL STUDY",
      title: /result/i.test(t) ? "SURPRISING RESULT" : "CLINICAL RESEARCH",
      emoji: "🔬",
      colors: THEMES.indigo,
      imageQuery: "medical research doctor laboratory",
      visual: {
        kind: "stat",
        label: "CLINICAL STUDY",
        value: /result/i.test(t) ? "DATA REVEALED" : "1000s MEASURED",
        sub: "Verified medical measurements",
      },
    };
  }

  // 9. Myths / worry / specialist advice
  if (/चिंता|जरूरत अक्सर होती ही नहीं|worry/i.test(t)) {
    return {
      tag: "REALITY CHECK",
      title: "NO NEED TO WORRY",
      emoji: "✅",
      colors: THEMES.teal,
      imageQuery: "confident healthy man wellness",
      visual: {kind: "myth", myth: "Constant worry about size", fact: "Most men fall within normal range"},
    };
  }
  if (/myths|इंटरनेट|qualified specialist|सलाह/i.test(t)) {
    return {
      tag: "EXPERT ADVICE",
      title: "SKIP INTERNET MYTHS",
      emoji: "🩺",
      colors: THEMES.crimson,
      imageQuery: "doctor medical consultation advice",
      visual: {kind: "myth", myth: "Unverified internet myths", fact: "Consult a qualified specialist"},
    };
  }

  // 10. Sexual satisfaction / health
  if (/satisfaction|depend नहीं/i.test(t)) {
    return {
      tag: "FACT CHECK",
      title: "NOT JUST SIZE",
      emoji: "💡",
      colors: THEMES.navy,
      imageQuery: "relationship wellness health",
      visual: {kind: "myth", myth: "Size determines everything", fact: "Comfort & health matter more"},
    };
  }

  // 11. Closing takeaway
  if (/competition नहीं/i.test(t)) {
    return {
      tag: "PERSPECTIVE",
      title: "NOT A COMPETITION",
      emoji: "🤝",
      colors: THEMES.teal,
      imageQuery: "confidence self care wellness",
      visual: {kind: "myth", myth: "Comparing yourself to others", fact: "Every body has natural variation"},
    };
  }
  if (/confidence/i.test(t) || i === totalScenes - 1) {
    return {
      tag: "TAKEAWAY",
      title: "HEALTH & CONFIDENCE",
      emoji: "✨",
      colors: THEMES.emerald,
      imageQuery: "confident healthy lifestyle wellness",
      visual: {kind: "bullets", items: ["Prioritize Sexual Health", "Ignore Unrealistic Myths", "Build Real Confidence"]},
    };
  }

  // 12. Opening hook
  if (i === 0) {
    return {
      tag: "MEDICAL FACTS",
      title: /\?$/.test(t) || /कितनी|what|how/i.test(t) ? "WHAT IS NORMAL?" : "KEY QUESTION",
      emoji: "📏",
      colors: THEMES.amber,
      imageQuery: extractEnglishQuery(t, "medical doctor science"),
      visual: {kind: "stat", label: "SCIENCE CHECK", value: "MEDICAL FACTS", sub: "What clinical studies actually show"},
    };
  }

  // 13. General topic fallback (works for any future script)
  let emoji = "💡";
  let colors = THEMES.navy;
  if (/heart|love|relation|दिल|प्यार/i.test(t)) { emoji = "❤️"; colors = THEMES.teal; }
  else if (/brain|mind|mental|stress|दिमाग/i.test(t)) { emoji = "🧠"; colors = THEMES.indigo; }
  else if (/food|diet|nutrition|खाना/i.test(t)) { emoji = "🥗"; colors = THEMES.emerald; }
  else if (/workout|exercise|fitness|gym/i.test(t)) { emoji = "💪"; colors = THEMES.teal; }
  else if (/warning|danger|गलत|avoid/i.test(t)) { emoji = "⚠️"; colors = THEMES.crimson; }
  else if (/science|study|doctor|medical/i.test(t)) { emoji = "🔬"; colors = THEMES.indigo; }

  return {
    tag: "KEY POINT",
    title: deriveFallbackTitle(t),
    emoji,
    colors,
    imageQuery: extractEnglishQuery(t, "medical health education"),
    visual: {kind: "emoji", emoji},
  };
}

function buildSceneData(scenes) {
  return scenes.map((s, i) => {
    const meta = analyzeSceneContent(s.text, i, scenes.length);
    return {
      tag: meta.tag,
      title: meta.title,
      caption: buildCaption(s.text),
      emoji: meta.emoji,
      colors: meta.colors,
      duration: s.duration,
      imageQuery: meta.imageQuery,
      visual: meta.visual,
    };
  });
}

export function probeAudioDuration(audioPath) {
  const bins = [FFPROBE, "ffprobe"].filter(Boolean);
  for (const bin of bins) {
    const prober = spawnSync(
      bin,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath],
      {encoding: "utf8"}
    );
    const parsed = parseFloat(prober.stdout?.trim?.() || "");
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  try {
    const buf = fs.readFileSync(audioPath);
    if (buf.length >= 44 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
      const byteRate = buf.readUInt32LE(28);
      if (byteRate > 0) {
        const wavDuration = (buf.length - 44) / byteRate;
        if (Number.isFinite(wavDuration) && wavDuration > 0) return wavDuration;
      }
    }
  } catch {
    // ignore
  }

  throw new Error(`Could not determine duration for audio file: ${audioPath}`);
}

export function generateScriptFromText(text, audioPath, voiceoverPublicPath = "audio/voiceover.mp3") {
  const total = probeAudioDuration(audioPath);
  const scenes = splitIntoScenes(text, total);
  const data = buildSceneData(scenes);
  return {accent: "#FFD54A", voiceover: voiceoverPublicPath, scenes: data, totalDuration: total};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [,, audioPath, textPath] = process.argv;
  const text = fs.readFileSync(textPath, "utf8");
  const result = generateScriptFromText(text, audioPath);
  console.log(JSON.stringify(result, null, 2));
}

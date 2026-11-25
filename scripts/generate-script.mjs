// Usage: ANTHROPIC_API_KEY=... node scripts/generate-script.mjs "topic here"
import fs from "node:fs";
import "./env.mjs";

const topic = process.argv.slice(2).join(" ") || "How are reels made with React";
const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("ANTHROPIC_API_KEY missing (.env)");

const system = `You write short-form vertical video scripts in Hinglish (Hindi in Roman script).
Return ONLY valid JSON, no markdown:
{"accent":"#hex","scenes":[{"tag":"SHORT LABEL","title":"2-3 WORD HEADLINE","caption":"spoken line, wrap 1-2 key words in *stars*","emoji":"one emoji","colors":["#hexLight","#hexDark"],"duration":3.5}]}
Rules: 7-10 scenes, captions under 12 words, hook in scene 1, call-to-action in last scene, vary colors per scene.`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
  body: JSON.stringify({
    model: "claude-sonnet-5-5",
    max_tokens: 2000,
    system,
    messages: [{role: "user", content: `Topic: ${topic}`}],
  }),
});
const data = await res.json();
if (!res.ok) throw new Error(JSON.stringify(data));
const text = data.content.map((c) => c.text ?? "").join("").replace(/```json|```/g, "").trim();
const json = JSON.parse(text);
fs.writeFileSync("src/data/script.json", JSON.stringify(json, null, 2));
console.log(`Wrote src/data/script.json with ${json.scenes.length} scenes`);

// Makes one mp3 per scene with ElevenLabs and links it in script.json
import fs from "node:fs";
import "./env.mjs";

const key = process.env.ELEVENLABS_API_KEY;
const voice = process.env.ELEVENLABS_VOICE_ID;
if (!key || !voice) throw new Error("ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID missing (.env)");

const file = "src/data/script.json";
const script = JSON.parse(fs.readFileSync(file, "utf8"));
fs.mkdirSync("public/audio", {recursive: true});

for (let i = 0; i < script.scenes.length; i++) {
  const s = script.scenes[i];
  const text = s.caption.replace(/\*/g, "");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {"xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg"},
    body: JSON.stringify({text, model_id: "eleven_multilingual_v2"}),
  });
  if (!res.ok) throw new Error(`Scene ${i}: ${res.status} ${await res.text()}`);
  fs.writeFileSync(`public/audio/scene-${i}.mp3`, Buffer.from(await res.arrayBuffer()));
  s.audio = `audio/scene-${i}.mp3`;
  console.log(`✓ scene ${i}`);
}
fs.writeFileSync(file, JSON.stringify(script, null, 2));

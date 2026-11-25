# Reel Studio (Remotion + Node)

React se vertical reels (1080x1920, 30fps) banane ka starter kit.

## Setup
```bash
npm install
cp .env.example .env     # keys daalo (optional, sirf AI script/voice ke liye)
npm run dev              # browser me live preview (Remotion Studio)
npm run render           # out/reel.mp4
```
Requirements: Node 18+ (ffmpeg Remotion khud handle karta hai).

## Auto pipeline
```bash
npm run script -- "topic yahan likho"   # Claude se Hinglish script -> src/data/script.json
npm run voice                           # ElevenLabs voiceover -> public/audio
npm run render                          # final mp4
```
Voice na ho to bhi chalega: har scene `duration` seconds ka hoga.

## Customize
- `src/data/script.json`  : scenes (tag, title, caption, emoji, colors, duration)
- `src/components/Scene.tsx`  : layout + animations (spring / interpolate)
- `src/components/Caption.tsx`: word-by-word captions, `*word*` = highlight
- Emoji ki jagah apni PNG: `public/` me daalo aur `<Img src={staticFile("banana.png")} />` use karo
- 3D chahiye: `npm i @remotion/three three @react-three/fiber`
- Background music: Reel.tsx me `<Audio src={staticFile("music.mp3")} volume={0.15} />`

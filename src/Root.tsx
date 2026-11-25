import {Composition, staticFile} from "remotion";
import {getAudioDurationInSeconds} from "@remotion/media-utils";
import {Reel} from "./Reel";
import type {ReelProps} from "./types";
import script from "./data/script.json";

export const FPS = 30;
export const PAD = 0.35; // seconds of breathing room after each voice line

export const Root = () => (
  <Composition
    id="Reel"
    component={Reel}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={FPS * 10}
    defaultProps={script as unknown as ReelProps}
    calculateMetadata={async ({props}) => {
      // Prefer the single global voiceover for total length when present
      if (props.voiceover) {
        const totalAudio = await getAudioDurationInSeconds(staticFile(props.voiceover));
        const scenes = props.scenes;
        const sceneTotal = scenes.reduce((a, s) => a + s.duration, 0);
        // Use whichever is longer so visuals never end before the voice
        const total = Math.max(totalAudio + PAD, sceneTotal);
        return {durationInFrames: Math.round(total * FPS), props};
      }
      // Fallback: derive per-scene duration from each scene's own audio (legacy)
      const scenes = await Promise.all(
        props.scenes.map(async (s) => {
          if (!s.audio) return s;
          try {
            const d = await getAudioDurationInSeconds(staticFile(s.audio));
            return {...s, duration: d + PAD};
          } catch {
            return s;
          }
        })
      );
      const total = scenes.reduce((a, s) => a + Math.round(s.duration * FPS), 0);
      return {durationInFrames: Math.max(total, 1), props: {...props, scenes}};
    }}
  />
);

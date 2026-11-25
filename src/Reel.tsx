import {AbsoluteFill, Audio, Sequence, staticFile} from "remotion";
import {Scene} from "./components/Scene";
import {FPS} from "./Root";
import type {ReelProps} from "./types";

export const Reel = ({scenes, accent, voiceover}: ReelProps) => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: "#000"}}>
      {voiceover ? <Audio src={staticFile(voiceover)} /> : null}
      {scenes.map((scene, i) => {
        const frames = Math.max(1, Math.round(scene.duration * FPS));
        const start = from;
        from += frames;
        return (
          <Sequence key={i} from={start} durationInFrames={frames}>
            <Scene scene={scene} accent={accent} index={i} total={scenes.length} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

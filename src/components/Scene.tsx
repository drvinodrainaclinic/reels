import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import type {SceneData} from "../types";
import {Caption} from "./Caption";
import {SceneVisualView} from "./Visuals";

export const Scene = ({
  scene,
  accent,
  index = 0,
  total = 1,
}: {
  scene: SceneData;
  accent: string;
  index?: number;
  total?: number;
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const tagIn = spring({frame, fps, config: {damping: 14}});
  const titleIn = spring({frame: frame - 5, fps, config: {damping: 11, stiffness: 120}});
  const tilt = interpolate(titleIn, [0, 1], [-5, -1]);
  const fadeOut = interpolate(frame, [Math.max(0, durationInFrames - 6), durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });

  const titleFontSize = scene.title.length > 16 ? 68 : scene.title.length > 12 ? 78 : 88;
  const pct = total > 0 ? Math.round(((index + 1) / total) * 100) : 100;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 32%, ${scene.colors[0]}, ${scene.colors[1]} 78%)`,
        alignItems: "center",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        opacity: fadeOut,
      }}
    >
      {/* Subtle top progress bar for viewer retention */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 60,
          right: 60,
          height: 8,
          borderRadius: 999,
          background: "rgba(255,255,255,0.16)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: accent,
            borderRadius: 999,
          }}
        />
      </div>

      {/* TAG PILL */}
      <div
        style={{
          marginTop: 120,
          padding: "12px 32px",
          borderRadius: 999,
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff",
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: 3,
          transform: `scale(${tagIn})`,
        }}
      >
        <span style={{color: accent}}>● </span>
        {scene.tag}
      </div>

      {/* TITLE */}
      <div
        style={{
          marginTop: 32,
          padding: "16px 40px",
          background: accent,
          color: "#111",
          fontSize: titleFontSize,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.08,
          borderRadius: 16,
          boxShadow: "0 16px 0 rgba(0,0,0,0.35)",
          transform: `scale(${titleIn}) rotate(${tilt}deg)`,
          maxWidth: 940,
        }}
      >
        {scene.title}
      </div>

      {/* KNOWLEDGE VISUAL / IMAGE */}
      <SceneVisualView scene={scene} accent={accent} />

      <Caption text={scene.caption} accent={accent} />
    </AbsoluteFill>
  );
};

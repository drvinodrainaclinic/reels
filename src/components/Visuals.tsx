import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import type {SceneData, SceneVisual} from "../types";

const cardBase: React.CSSProperties = {
  width: 900,
  borderRadius: 28,
  background: "rgba(8, 13, 24, 0.72)",
  border: "2px solid rgba(255,255,255,0.14)",
  boxShadow: "0 28px 60px rgba(0,0,0,0.45)",
  padding: "36px 40px",
  color: "#fff",
  backdropFilter: "blur(8px)",
};

export const SceneVisualView = ({scene, accent}: {scene: SceneData; accent: string}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const pop = spring({frame: frame - 10, fps, config: {damping: 11, stiffness: 110}});
  const float = Math.sin(frame / 14) * 8;
  const zoom = interpolate(frame, [0, Math.max(1, durationInFrames)], [1, 1.08], {
    extrapolateRight: "clamp",
  });

  // Priority 1: explicit scene image (uploaded or fetched from Google/Pexels/Wikimedia)
  if (scene.image) {
    const src = /^https?:\/\//i.test(scene.image) ? scene.image : staticFile(scene.image);
    return (
      <div
        style={{
          marginTop: 52,
          width: 860,
          height: 580,
          borderRadius: 30,
          overflow: "hidden",
          border: `3px solid ${accent}`,
          boxShadow: "0 30px 65px rgba(0,0,0,0.55)",
          background: "#0b111e",
          transform: `scale(${pop})`,
          position: "relative",
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${zoom})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)",
          }}
        />
      </div>
    );
  }

  const v: SceneVisual = scene.visual || {kind: "emoji", emoji: scene.emoji};

  if (v.kind === "stat") {
    const barProgress = spring({frame: frame - 14, fps, config: {damping: 14}});
    return (
      <div
        style={{
          ...cardBase,
          marginTop: 56,
          textAlign: "center",
          transform: `scale(${pop}) translateY(${float * 0.5}px)`,
        }}
      >
        <div style={{fontSize: 30, fontWeight: 700, letterSpacing: 4, color: accent, marginBottom: 14}}>
          {scene.emoji} {v.label}
        </div>
        <div
          style={{
            fontSize: v.value.length > 10 ? 74 : 112,
            fontWeight: 900,
            lineHeight: 1.05,
            color: "#fff",
            letterSpacing: -1,
          }}
        >
          {v.value}
        </div>
        <div
          style={{
            marginTop: 26,
            height: 16,
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(barProgress * 78)}%`,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${accent}, #44d488)`,
            }}
          />
        </div>
        {v.sub ? (
          <div style={{marginTop: 22, fontSize: 32, color: "#cbd5e1", fontWeight: 600}}>
            {v.sub}
          </div>
        ) : null}
      </div>
    );
  }

  if (v.kind === "compare") {
    return (
      <div
        style={{
          marginTop: 56,
          width: 920,
          display: "flex",
          gap: 24,
          transform: `scale(${pop})`,
        }}
      >
        {[
          {title: v.leftTitle, text: v.leftText, color: "#3ec5ff", badge: "📈 TYPE 1"},
          {title: v.rightTitle, text: v.rightText, color: accent, badge: "📊 TYPE 2"},
        ].map((col, idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              borderRadius: 26,
              background: "rgba(8, 13, 24, 0.78)",
              border: `2px solid ${col.color}`,
              padding: "34px 28px",
              boxShadow: "0 24px 50px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{fontSize: 24, fontWeight: 800, letterSpacing: 2, color: col.color}}>
              {col.badge}
            </div>
            <div style={{fontSize: 44, fontWeight: 900, color: "#fff", marginTop: 10}}>
              {col.title}
            </div>
            <div style={{fontSize: 30, lineHeight: 1.35, color: "#dbe4f0", marginTop: 16, fontWeight: 600}}>
              {col.text}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (v.kind === "myth") {
    return (
      <div
        style={{
          marginTop: 52,
          width: 900,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          transform: `scale(${pop})`,
        }}
      >
        <div
          style={{
            borderRadius: 24,
            background: "rgba(127, 29, 29, 0.55)",
            border: "2px solid #ff6675",
            padding: "28px 34px",
          }}
        >
          <div style={{fontSize: 24, fontWeight: 800, letterSpacing: 3, color: "#ff99a4"}}>
            ❌ MYTH
          </div>
          <div style={{fontSize: 38, fontWeight: 800, color: "#fff", marginTop: 8}}>
            {v.myth}
          </div>
        </div>
        <div
          style={{
            borderRadius: 24,
            background: "rgba(6, 95, 70, 0.58)",
            border: "2px solid #44d488",
            padding: "28px 34px",
          }}
        >
          <div style={{fontSize: 24, fontWeight: 800, letterSpacing: 3, color: "#7ef0b5"}}>
            ✅ MEDICAL FACT
          </div>
          <div style={{fontSize: 38, fontWeight: 800, color: "#fff", marginTop: 8}}>
            {v.fact}
          </div>
        </div>
      </div>
    );
  }

  if (v.kind === "bullets") {
    return (
      <div
        style={{
          ...cardBase,
          marginTop: 52,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          transform: `scale(${pop})`,
        }}
      >
        {v.items.slice(0, 4).map((item, idx) => {
          const o = interpolate(frame, [12 + idx * 5, 18 + idx * 5], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={idx}
              style={{
                opacity: o,
                transform: `translateX(${(1 - o) * -28}px)`,
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "16px 24px",
                borderRadius: 18,
                background: "rgba(255,255,255,0.08)",
                fontSize: 36,
                fontWeight: 700,
              }}
            >
              <span style={{color: "#44d488", fontSize: 38}}>✔</span>
              <span>{item}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (v.kind === "doctor") {
    return (
      <div
        style={{
          ...cardBase,
          marginTop: 52,
          textAlign: "center",
          border: `2px solid ${accent}`,
          transform: `scale(${pop}) translateY(${float * 0.4}px)`,
        }}
      >
        <div style={{fontSize: 96, lineHeight: 1.1}}>🩺</div>
        <div style={{fontSize: 48, fontWeight: 900, color: "#fff", marginTop: 12}}>
          {v.name}
        </div>
        <div style={{fontSize: 32, fontWeight: 700, color: "#7ef0b5", marginTop: 8}}>
          {v.role}
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 26,
            padding: "14px 36px",
            borderRadius: 999,
            background: accent,
            color: "#111",
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: 1,
          }}
        >
          {v.cta}
        </div>
      </div>
    );
  }

  // Fallback clean framed icon
  const emoji = v.kind === "emoji" ? v.emoji : scene.emoji;
  return (
    <div
      style={{
        marginTop: 80,
        width: 420,
        height: 420,
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "2px solid rgba(255,255,255,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 240,
        transform: `translateY(${float}px) scale(${pop})`,
        boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
      }}
    >
      {emoji}
    </div>
  );
};

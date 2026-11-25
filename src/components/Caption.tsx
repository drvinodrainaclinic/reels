import {interpolate, useCurrentFrame} from "remotion";

// "Haan *React* se video" -> *React* is highlighted
export const Caption = ({text, accent}: {text: string; accent: string}) => {
  const frame = useCurrentFrame();
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  const words = parts.flatMap((p) => {
    const hl = p.startsWith("*") && p.endsWith("*");
    const clean = hl ? p.slice(1, -1) : p;
    return clean.split(" ").filter(Boolean).map((w) => ({w, hl}));
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 185,
        left: 60,
        right: 60,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "10px 14px",
      }}
    >
      {words.map(({w, hl}, i) => {
        const o = interpolate(frame, [10 + i * 3, 14 + i * 3], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              opacity: o,
              transform: `translateY(${(1 - o) * 20}px)`,
              padding: "8px 20px",
              borderRadius: 14,
              background: "rgba(0,0,0,0.72)",
              color: hl ? accent : "#fff",
              fontSize: 46,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

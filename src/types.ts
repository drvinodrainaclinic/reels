export type SceneVisual =
  | {
      kind: "stat";
      label: string;
      value: string;
      sub?: string;
      compare?: {label: string; value: string};
    }
  | {
      kind: "compare";
      leftTitle: string;
      leftText: string;
      rightTitle: string;
      rightText: string;
    }
  | {
      kind: "myth";
      myth: string;
      fact: string;
    }
  | {
      kind: "bullets";
      items: string[];
    }
  | {
      kind: "doctor";
      name: string;
      role: string;
      cta: string;
    }
  | {
      kind: "image";
      src: string;
      credit?: string;
    }
  | {
      kind: "emoji";
      emoji: string;
    };

export type SceneData = {
  tag: string;        // small pill on top, e.g. "MEDICAL STUDY"
  title: string;      // big headline
  caption: string;    // bottom subtitle. Wrap words in *stars* to highlight
  emoji: string;      // fallback/accent icon
  colors: [string, string]; // background gradient [inner, outer]
  duration: number;   // seconds (used when there is no audio)
  audio?: string;     // per-scene audio inside /public (optional; voiceover takes priority)
  image?: string;     // optional local public/ path or URL for scene visual
  imageQuery?: string; // suggested search query for stock/Google image search
  visual?: SceneVisual; // knowledge-based visual card
};

export type ReelProps = {
  scenes: SceneData[];
  accent: string;
  voiceover?: string; // single voiceover that plays across the whole reel (/public path)
};

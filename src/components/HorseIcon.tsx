import { useId } from "react";

/**
 * Colour scheme per investment type. Golden/Silver/Bronze get a metallic
 * gradient in their colour. Lucky shimmers through the rainbow with twinkling
 * sparkles, Stupid is plain grey and gallops the wrong way, and Nostalgic is a
 * sepia rocking horse that rocks instead of galloping.
 */
interface HorseStyle {
  label: string;
  stops: [string, string, string];
  mane: string;
  rocking?: boolean;
  /** Faces and runs left instead of right. */
  reverse?: boolean;
  /** Colour-cycling coat with sparkles. */
  sparkle?: boolean;
  rank: number;
}

const STYLES: [RegExp, HorseStyle][] = [
  [/gold|gyllen|guld/i, { label: "Golden horse", stops: ["#fff4b8", "#f2c230", "#a87908"], mane: "#7a5806", rank: 1 }],
  [/silver/i, { label: "Silver horse", stops: ["#ffffff", "#c9ced6", "#7c838e"], mane: "#5c636d", rank: 2 }],
  [/bronze|brons/i, { label: "Bronze horse", stops: ["#f6c79a", "#c67f43", "#7d4a1f"], mane: "#5e3614", rank: 3 }],
  [/lucky|tur/i, { label: "Lucky horse", stops: ["#ff8ad8", "#9b6bff", "#2fd4ff"], mane: "#5b2bd6", sparkle: true, rank: 4 }],
  [/stupid|dum/i, { label: "Stupid horse", stops: ["#d9d9d9", "#9a9a9a", "#626262"], mane: "#474747", reverse: true, rank: 5 }],
  [/nostalg/i, { label: "Nostalgic horse", stops: ["#f3e2c3", "#c49a6c", "#7b5a3a"], mane: "#5a3e24", rocking: true, rank: 6 }],
  [/horse|häst/i, { label: "Horse", stops: ["#e8c9a5", "#a8754a", "#6b4527"], mane: "#3f2716", rank: 7 }],
];

export function horseStyle(type?: string): HorseStyle | null {
  if (!type) return null;
  return STYLES.find(([re]) => re.test(type))?.[1] ?? null;
}

/** Sort order for investment types: Golden first, unknown last. */
export const investmentRank = (type?: string) => (type ? horseStyle(type)?.rank ?? 50 : null);

export const KNOWN_TYPES = ["Golden horse", "Silver horse", "Bronze horse", "Lucky horse", "Stupid horses", "Nostalgic horse"];

// A four-pointed star, drawn around (0, 0).
const STAR = "M0 -4 L1.1 -1.1 L4 0 L1.1 1.1 L0 4 L-1.1 1.1 L-4 0 L-1.1 -1.1 Z";
const SPARKLES: [x: number, y: number, scale: number, delay: string, fill: string][] = [
  [9, 7, 1.5, "0s", "#f5b700"],
  [33, 2, 1.1, "0.5s", "#ff4fd0"],
  [61, 21, 1.35, "0.9s", "#19c8ff"],
  [24, 37, 1.05, "1.3s", "#8a5cff"],
];

// Leg positions: stretched out and gathered in, alternated to gallop.
const LEGS_OUT = ["42,24 49,30 56,32", "39,25 45,32 50,37", "21,24 14,30 7,31", "24,25 19,32 13,36"];
const LEGS_IN = ["42,24 41,31 36,36", "39,25 37,31 41,37", "21,24 25,31 30,35", "24,25 22,32 26,37"];
const LEGS_STAND = ["41,24 42,37", "38,25 38,37", "22,24 21,37", "25,25 25,37"];

/** A small horse in the colour of its investment type; gallops (or rocks, for Nostalgic horse). */
export function HorseIcon({ type, size = 22 }: { type?: string; size?: number }) {
  const id = useId().replace(/:/g, "");
  const st = horseStyle(type);
  if (!st) return null;
  const fill = `url(#h${id})`;
  const legs = (pts: string[], cls: string) => (
    <g className={cls} stroke={fill} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {pts.map((p) => (
        <polyline key={p} points={p} />
      ))}
    </g>
  );

  return (
    <span
      className={["horse", st.rocking ? "rocking" : "galloping", st.reverse ? "reverse" : "", st.sparkle ? "sparkling" : ""].join(" ").trim()}
      title={type}
      role="img"
      aria-label={type}
    >
      <svg width={size * 1.45} height={size} viewBox="0 0 64 44" aria-hidden>
        <defs>
          <linearGradient id={`h${id}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor={st.stops[0]} />
            <stop offset="0.45" stopColor={st.stops[1]} />
            <stop offset="1" stopColor={st.stops[2]} />
          </linearGradient>
        </defs>
        <g className="horse-coat">
        <g className="horse-body">
          {st.rocking ? legs(LEGS_STAND, "") : <>{legs(LEGS_OUT, "legs-a")}{legs(LEGS_IN, "legs-b")}</>}
          {/* tail */}
          <path d="M19 18 C12 16 7 21 4 29 C9 27 13 25 18 23 Z" fill={st.mane} />
          {/* body, neck, head */}
          <path d="M18 17 C21 12 37 11 44 14 C48 16 48 23 44 25.5 C37 28 24 28 19 26 C15 24 15 19 18 17 Z" fill={fill} />
          <path d="M39 16 C42 11 45 7 49 4.5 L54 8.5 C51 12 48 17 46 23 Z" fill={fill} />
          <path d="M48.5 4 C52 1.8 56.5 3 60.5 7 C61.8 8.8 60.8 11 58.5 11 C55.5 10.2 53 10.2 50.5 11.2 Z" fill={fill} />
          <path d="M49.5 4.2 L50.6 0.4 L52.8 3.2 Z" fill={fill} />
          {/* mane */}
          <path d="M40 15 C43 10 45.5 6.5 49.5 4 L48.8 7.2 C46.5 10 44.6 13 42.6 17 Z" fill={st.mane} />
          {/* eye + highlight */}
          <circle cx="55.2" cy="6.4" r="0.9" fill={st.mane} />
          <path d="M22 16.5 C28 14 36 13.6 42 15.4" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </g>
        </g>
        {st.rocking && <path d="M6 39 Q32 47 58 39" stroke={st.mane} strokeWidth="2.6" fill="none" strokeLinecap="round" />}
        {st.sparkle &&
          SPARKLES.map(([x, y, k, delay, fill]) => (
            <g key={delay} transform={`translate(${x} ${y}) scale(${k})`}>
              <path className="sparkle" d={STAR} fill={fill} style={{ animationDelay: delay }} />
            </g>
          ))}
      </svg>
    </span>
  );
}

'use client';

// Classic production-storyboard camera direction annotations.
// Wide hollow chevrons with cross-hatching — inspired by the hand-drawn
// tradition used in animation and live-action planning.
// Only rendered in WATERCOLOUR_SKETCH mode.

interface Grammar {
  camera_move: string;
  screen_direction: string;
  scale: string;
}

type MoveType =
  | 'pan-right' | 'pan-left'
  | 'track-right' | 'track-left'
  | 'tilt-up' | 'tilt-down'
  | 'dolly-in' | 'dolly-out'
  | 'toward-camera' | 'away-camera'
  | 'arc'
  | 'none';

function classifyMove(grammar: Grammar): MoveType {
  const move = (grammar.camera_move ?? '').toLowerCase();
  const dir = (grammar.screen_direction ?? '').toLowerCase();

  if (!move || move === 'static' || move === 'locked off' || move === 'locked') return 'none';
  if (move.includes('handheld') || move.includes('steadicam')) return 'none';

  if (move.includes('dolly in') || move.includes('push in') || move.includes('zoom in')) return 'dolly-in';
  if (move.includes('dolly out') || move.includes('pull out') || move.includes('zoom out')) return 'dolly-out';
  if (move.includes('toward') || move.includes('toward camera')) return 'toward-camera';
  if (move.includes('away from camera')) return 'away-camera';

  if (move.includes('pan right') || (move.includes('pan') && (dir.includes('→') || dir.includes('right')))) return 'pan-right';
  if (move.includes('pan left') || (move.includes('pan') && (dir.includes('←') || dir.includes('left')))) return 'pan-left';

  if (move.includes('track right') || (move.includes('track') && dir.includes('→'))) return 'track-right';
  if (move.includes('track left') || (move.includes('track') && dir.includes('←'))) return 'track-left';

  if (move.includes('tilt up') || move.includes('crane up') || move.includes('pedestal up')) return 'tilt-up';
  if (move.includes('tilt down') || move.includes('crane down') || move.includes('pedestal down')) return 'tilt-down';

  if (move.includes('arc') || move.includes('orbit') || move.includes('360')) return 'arc';

  // Direction fallback
  if (dir.includes('→') || dir.includes('right')) return 'pan-right';
  if (dir.includes('←') || dir.includes('left')) return 'pan-left';

  return 'none';
}

// Shared defs: sketch filter for hand-drawn feel, hatch pattern.
function Defs() {
  return (
    <defs>
      <filter id="ca-sketch" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04 0.06" numOctaves="4" seed="8" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <pattern id="ca-hatch" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
      </pattern>
    </defs>
  );
}

// ─── Horizontal pan / track ───────────────────────────────────────────────────
// Wide flat arrowhead spanning ~60% of frame width, centered vertically near
// the bottom quarter — classic "to camera left / to camera right" annotation.

function HorizontalArrow({ right, label }: { right: boolean; label: string }) {
  // Arrow pointing right: broad flat chevron
  // Notch at the left (tail), point at the right (head)
  const pts = right
    ? '24,88 248,88 248,64 308,112 248,160 248,136 24,136 60,112'
    : '296,88 72,88 72,64 12,112 72,160 72,136 296,136 260,112';

  return (
    <svg
      viewBox="0 0 320 224"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: 'url(#ca-sketch)' }}
    >
      <Defs />
      <polygon points={pts} fill="white" stroke="black" strokeWidth="3.5" strokeLinejoin="round" />
      <polygon points={pts} fill="url(#ca-hatch)" />
      <text
        x={160} y={54}
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontSize={13}
        fontWeight="bold"
        letterSpacing="0.12em"
        fill="black"
      >
        {label}
      </text>
    </svg>
  );
}

// ─── Vertical tilt ────────────────────────────────────────────────────────────
// Broad flat chevron pointing up or down, on the right third of the frame.

function VerticalArrow({ up, label }: { up: boolean; label: string }) {
  const pts = up
    ? '228,196 228,76 204,76 256,16 308,76 284,76 284,196 256,164'
    : '228,28 228,148 204,148 256,208 308,148 284,148 284,28 256,60';

  return (
    <svg
      viewBox="0 0 320 224"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: 'url(#ca-sketch)' }}
    >
      <Defs />
      <polygon points={pts} fill="white" stroke="black" strokeWidth="3.5" strokeLinejoin="round" />
      <polygon points={pts} fill="url(#ca-hatch)" />
      <text
        x={256} y={220}
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontSize={11}
        fontWeight="bold"
        letterSpacing="0.1em"
        fill="black"
      >
        {label}
      </text>
    </svg>
  );
}

// ─── Dolly in / toward camera ─────────────────────────────────────────────────
// Four converging corner arrows — one per corner pointing inward.

function DollyInArrows({ label }: { label: string }) {
  // Each corner arrow: a small flat chevron pointing toward center
  const arrows = [
    // top-left pointing down-right
    { pts: '12,12 52,12 52,28 84,28 52,60 52,44 12,44 28,28', tx: 48, ty: 76 },
    // top-right pointing down-left
    { pts: '308,12 268,12 268,28 236,28 268,60 268,44 308,44 292,28', tx: 268, ty: 76 },
    // bottom-left pointing up-right
    { pts: '12,212 52,212 52,196 84,196 52,164 52,180 12,180 28,196', tx: 48, ty: 152 },
    // bottom-right pointing up-left
    { pts: '308,212 268,212 268,196 236,196 268,164 268,180 308,180 292,196', tx: 268, ty: 152 },
  ] as const;

  return (
    <svg
      viewBox="0 0 320 224"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: 'url(#ca-sketch)' }}
    >
      <Defs />
      {arrows.map((a, i) => (
        <g key={i}>
          <polygon points={a.pts} fill="white" stroke="black" strokeWidth="3" strokeLinejoin="round" />
          <polygon points={a.pts} fill="url(#ca-hatch)" />
        </g>
      ))}
      <text
        x={160} y={118}
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontSize={13}
        fontWeight="bold"
        letterSpacing="0.12em"
        fill="black"
      >
        {label}
      </text>
    </svg>
  );
}

// ─── Dolly out / away from camera ─────────────────────────────────────────────
// Four diverging corner arrows pointing outward from center.

function DollyOutArrows({ label }: { label: string }) {
  const arrows = [
    // top-left pointing up-left (away)
    { pts: '72,72 32,72 32,56 12,56 32,24 32,40 72,40 56,56' },
    // top-right pointing up-right
    { pts: '248,72 288,72 288,56 308,56 288,24 288,40 248,40 264,56' },
    // bottom-left pointing down-left
    { pts: '72,152 32,152 32,168 12,168 32,200 32,184 72,184 56,168' },
    // bottom-right pointing down-right
    { pts: '248,152 288,152 288,168 308,168 288,200 288,184 248,184 264,168' },
  ] as const;

  return (
    <svg
      viewBox="0 0 320 224"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: 'url(#ca-sketch)' }}
    >
      <Defs />
      {arrows.map((a, i) => (
        <g key={i}>
          <polygon points={a.pts} fill="white" stroke="black" strokeWidth="3" strokeLinejoin="round" />
          <polygon points={a.pts} fill="url(#ca-hatch)" />
        </g>
      ))}
      <text
        x={160} y={118}
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontSize={13}
        fontWeight="bold"
        letterSpacing="0.12em"
        fill="black"
      >
        {label}
      </text>
    </svg>
  );
}

// ─── Arc / orbit ──────────────────────────────────────────────────────────────

function ArcArrow({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 320 224"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: 'url(#ca-sketch)' }}
    >
      <Defs />
      {/* Broad curved path representing an orbit arc */}
      <path
        d="M 48 176 C 48 72 272 72 272 176"
        fill="none"
        stroke="black"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M 48 176 C 48 72 272 72 272 176"
        fill="none"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Arrowhead at end of arc */}
      <polygon points="272,176 250,148 292,148" fill="white" stroke="black" strokeWidth="2.5" strokeLinejoin="round" />
      <text
        x={160} y={118}
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontSize={13}
        fontWeight="bold"
        letterSpacing="0.12em"
        fill="black"
      >
        {label}
      </text>
    </svg>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface CameraArrowsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- grammar shape from parsed JSON
  grammar: any;
}

export function CameraArrows({ grammar }: CameraArrowsProps) {
  if (!grammar) return null;
  const move = classifyMove(grammar as Grammar);

  switch (move) {
    case 'pan-right':   return <HorizontalArrow right label="PAN →" />;
    case 'pan-left':    return <HorizontalArrow right={false} label="← PAN" />;
    case 'track-right': return <HorizontalArrow right label="TRACK →" />;
    case 'track-left':  return <HorizontalArrow right={false} label="← TRACK" />;
    case 'tilt-up':     return <VerticalArrow up label="TILT ↑" />;
    case 'tilt-down':   return <VerticalArrow up={false} label="TILT ↓" />;
    case 'dolly-in':
    case 'toward-camera': return <DollyInArrows label="DOLLY IN" />;
    case 'dolly-out':
    case 'away-camera':   return <DollyOutArrows label="DOLLY OUT" />;
    case 'arc':         return <ArcArrow label="ARC" />;
    default:            return null;
  }
}

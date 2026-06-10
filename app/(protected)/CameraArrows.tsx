'use client';

// SVG overlay that renders camera movement annotation arrows for a storyboard
// frame. Derived purely from grammar fields — no API calls, instant on/off.

interface Grammar {
  camera_move: string;
  screen_direction: string;
  scale: string;
}

interface Arrow {
  type: 'horizontal' | 'vertical' | 'zoom-in' | 'zoom-out' | 'arc' | 'none';
  direction?: 'left' | 'right' | 'up' | 'down';
  label: string;
}

function classifyMove(grammar: Grammar): Arrow {
  const move = grammar.camera_move.toLowerCase();
  const dir = grammar.screen_direction;

  if (!move || move === 'static' || move === 'locked off') {
    return { type: 'none', label: '' };
  }
  if (move.includes('dolly in') || move.includes('push in') || move.includes('zoom in')) {
    return { type: 'zoom-in', label: 'DOLLY IN' };
  }
  if (move.includes('dolly out') || move.includes('pull out') || move.includes('zoom out')) {
    return { type: 'zoom-out', label: 'DOLLY OUT' };
  }
  if (move.includes('pan right') || (move.includes('pan') && (dir === '→' || dir.toLowerCase().includes('right')))) {
    return { type: 'horizontal', direction: 'right', label: 'PAN →' };
  }
  if (move.includes('pan left') || (move.includes('pan') && (dir === '←' || dir.toLowerCase().includes('left')))) {
    return { type: 'horizontal', direction: 'left', label: 'PAN ←' };
  }
  if (move.includes('track right') || move.includes('lateral') && dir.includes('→')) {
    return { type: 'horizontal', direction: 'right', label: 'TRACK →' };
  }
  if (move.includes('track left') || move.includes('lateral')) {
    return { type: 'horizontal', direction: 'left', label: 'TRACK ←' };
  }
  if (move.includes('tilt up') || move.includes('crane up') || move.includes('pedestal up')) {
    return { type: 'vertical', direction: 'up', label: 'TILT ↑' };
  }
  if (move.includes('tilt down') || move.includes('crane down') || move.includes('pedestal down')) {
    return { type: 'vertical', direction: 'down', label: 'TILT ↓' };
  }
  if (move.includes('arc') || move.includes('orbit') || move.includes('360')) {
    return { type: 'arc', label: 'ARC' };
  }
  if (move.includes('handheld') || move.includes('steadicam')) {
    return { type: 'none', label: '' };
  }
  // Generic move — derive direction from screen_direction field
  if (dir === '→' || dir.toLowerCase().includes('right')) {
    return { type: 'horizontal', direction: 'right', label: move.toUpperCase().slice(0, 12) };
  }
  if (dir === '←' || dir.toLowerCase().includes('left')) {
    return { type: 'horizontal', direction: 'left', label: move.toUpperCase().slice(0, 12) };
  }
  return { type: 'none', label: '' };
}

// SVG arrow paths drawn in a classic production storyboard style:
// bold black strokes, white fill on arrowheads, drawn near the frame edges.

function HorizontalArrow({ direction, label }: { direction: 'left' | 'right'; label: string }) {
  const right = direction === 'right';
  return (
    <svg
      viewBox="0 0 320 56"
      className="absolute bottom-2 left-0 right-0 mx-auto w-3/4 pointer-events-none"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}
    >
      {/* Shaft */}
      <line x1={right ? 12 : 308} y1={28} x2={right ? 280 : 40} y2={28}
        stroke="white" strokeWidth={4} strokeLinecap="round" />
      <line x1={right ? 12 : 308} y1={28} x2={right ? 280 : 40} y2={28}
        stroke="black" strokeWidth={2} strokeLinecap="round" />
      {/* Arrowhead */}
      <polygon
        points={right ? '308,28 280,16 280,40' : '12,28 40,16 40,40'}
        fill="white" stroke="black" strokeWidth={2} strokeLinejoin="round"
      />
      {/* Label */}
      <text x={160} y={22} textAnchor="middle" fontFamily="monospace" fontSize={11}
        fontWeight="bold" fill="white" stroke="black" strokeWidth={3} paintOrder="stroke">
        {label}
      </text>
    </svg>
  );
}

function VerticalArrow({ direction, label }: { direction: 'up' | 'down'; label: string }) {
  const up = direction === 'up';
  return (
    <svg
      viewBox="0 0 56 160"
      className="absolute top-0 bottom-0 right-2 my-auto h-3/4 pointer-events-none"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}
    >
      <line x1={28} y1={up ? 140 : 12} x2={28} y2={up ? 28 : 124}
        stroke="white" strokeWidth={4} strokeLinecap="round" />
      <line x1={28} y1={up ? 140 : 12} x2={28} y2={up ? 28 : 124}
        stroke="black" strokeWidth={2} strokeLinecap="round" />
      <polygon
        points={up ? '28,12 16,36 40,36' : '28,148 16,124 40,124'}
        fill="white" stroke="black" strokeWidth={2} strokeLinejoin="round"
      />
      <text x={28} y={up ? 90 : 70} textAnchor="middle" fontFamily="monospace"
        fontSize={10} fontWeight="bold" fill="white" stroke="black" strokeWidth={3}
        paintOrder="stroke" transform="rotate(-90,28,80)">
        {label}
      </text>
    </svg>
  );
}

function ZoomArrows({ inward, label }: { inward: boolean; label: string }) {
  // Four converging (dolly-in) or diverging (dolly-out) corner arrows
  const corners = [
    { x1: 12, y1: 12, x2: inward ? 36 : 4, y2: inward ? 36 : 4 },
    { x1: 308, y1: 12, x2: inward ? 284 : 316, y2: inward ? 36 : 4 },
    { x1: 12, y1: 148, x2: inward ? 36 : 4, y2: inward ? 124 : 156 },
    { x1: 308, y1: 148, x2: inward ? 284 : 316, y2: inward ? 124 : 156 },
  ] as const;
  return (
    <svg
      viewBox="0 0 320 160"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}
    >
      {corners.map((c, i) => (
        <g key={i}>
          <line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
            stroke="white" strokeWidth={5} strokeLinecap="round" />
          <line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
            stroke="black" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      ))}
      <text x={160} y={88} textAnchor="middle" fontFamily="monospace" fontSize={12}
        fontWeight="bold" fill="white" stroke="black" strokeWidth={3} paintOrder="stroke">
        {label}
      </text>
    </svg>
  );
}

function ArcArrow({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 320 160"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}
    >
      {/* Semicircular arc across the bottom */}
      <path d="M 40 140 Q 160 60 280 140"
        fill="none" stroke="white" strokeWidth={4} strokeLinecap="round" />
      <path d="M 40 140 Q 160 60 280 140"
        fill="none" stroke="black" strokeWidth={2} strokeLinecap="round" />
      <polygon points="280,140 260,128 272,120" fill="white" stroke="black" strokeWidth={2} />
      <text x={160} y={84} textAnchor="middle" fontFamily="monospace" fontSize={12}
        fontWeight="bold" fill="white" stroke="black" strokeWidth={3} paintOrder="stroke">
        {label}
      </text>
    </svg>
  );
}

interface CameraArrowsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- grammar shape from parsed JSON
  grammar: any;
}

export function CameraArrows({ grammar }: CameraArrowsProps) {
  if (!grammar) return null;
  const arrow = classifyMove(grammar as Grammar);
  if (arrow.type === 'none') return null;

  if (arrow.type === 'horizontal' && arrow.direction) {
    return <HorizontalArrow direction={arrow.direction as 'left' | 'right'} label={arrow.label} />;
  }
  if (arrow.type === 'vertical' && arrow.direction) {
    return <VerticalArrow direction={arrow.direction as 'up' | 'down'} label={arrow.label} />;
  }
  if (arrow.type === 'zoom-in') return <ZoomArrows inward label={arrow.label} />;
  if (arrow.type === 'zoom-out') return <ZoomArrows inward={false} label={arrow.label} />;
  if (arrow.type === 'arc') return <ArcArrow label={arrow.label} />;
  return null;
}

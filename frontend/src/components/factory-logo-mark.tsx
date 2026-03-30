'use client'

export function FactoryLogoMark({ className = "w-7 h-7" }: { className?: string }) {
  const dur = 4
  const d = dur / 12

  const spokes = [
    { x1: 0, y1: -16, x2: 0, y2: -65 },
    { x1: 8, y1: -13.9, x2: 32.5, y2: -56.3 },
    { x1: 13.9, y1: -8, x2: 56.3, y2: -32.5 },
    { x1: 16, y1: 0, x2: 65, y2: 0 },
    { x1: 13.9, y1: 8, x2: 56.3, y2: 32.5 },
    { x1: 8, y1: 13.9, x2: 32.5, y2: 56.3 },
    { x1: 0, y1: 16, x2: 0, y2: 65 },
    { x1: -8, y1: 13.9, x2: -32.5, y2: 56.3 },
    { x1: -13.9, y1: 8, x2: -56.3, y2: 32.5 },
    { x1: -16, y1: 0, x2: -65, y2: 0 },
    { x1: -13.9, y1: -8, x2: -56.3, y2: -32.5 },
    { x1: -8, y1: -13.9, x2: -32.5, y2: -56.3 },
  ]

  const nodes = [
    { cx: 0, cy: -50, r: 4, i: 0 }, { cx: 0, cy: -65, r: 3, i: 0 },
    { cx: 25, cy: -43, r: 3.5, i: 1 },
    { cx: 43, cy: -25, r: 4, i: 2 },
    { cx: 50, cy: 0, r: 3.5, i: 3 }, { cx: 65, cy: 0, r: 3, i: 3 },
    { cx: 43, cy: 25, r: 4, i: 4 },
    { cx: 25, cy: 43, r: 3.5, i: 5 },
    { cx: 0, cy: 50, r: 4, i: 6 }, { cx: 0, cy: 65, r: 3, i: 6 },
    { cx: -25, cy: 43, r: 3.5, i: 7 },
    { cx: -43, cy: 25, r: 4, i: 8 },
    { cx: -50, cy: 0, r: 3.5, i: 9 }, { cx: -65, cy: 0, r: 3, i: 9 },
    { cx: -43, cy: -25, r: 4, i: 10 },
    { cx: -25, cy: -43, r: 3.5, i: 11 },
  ]

  return (
    <>
      <style>{`
        @keyframes mk-trace {
          0% { stroke-dashoffset: 1; opacity: 0.2; }
          15% { opacity: 1; filter: drop-shadow(0 0 4px rgba(255,255,255,0.8)); }
          30% { stroke-dashoffset: 0; opacity: 1; }
          50% { filter: drop-shadow(0 0 1px rgba(255,255,255,0.2)); }
          100% { stroke-dashoffset: 0; opacity: 0.6; filter: none; }
        }
        @keyframes mk-pop {
          0% { opacity: 0; }
          20% { opacity: 1; filter: drop-shadow(0 0 6px rgba(255,255,255,0.9)); }
          40% { filter: drop-shadow(0 0 2px rgba(255,255,255,0.4)); }
          100% { opacity: 0.8; filter: none; }
        }
        @keyframes mk-ring {
          0% { opacity: 0.3; }
          10% { opacity: 1; filter: drop-shadow(0 0 6px rgba(255,255,255,0.6)); }
          30% { filter: drop-shadow(0 0 2px rgba(255,255,255,0.2)); }
          100% { opacity: 0.7; filter: none; }
        }
        .mk-spoke { stroke-dasharray: 1; animation: mk-trace ${dur}s ease-out infinite; }
        .mk-node { animation: mk-pop ${dur}s ease-out infinite; }
        .mk-ring { animation: mk-ring ${dur * 1.5}s ease-out infinite; }
      `}</style>
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className={className}>
        <g transform="translate(100,100)">
          {/* Core rings */}
          <circle cx="0" cy="0" r="14" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5"
            className="mk-ring" style={{ animationDelay: '0s' }} />
          <circle cx="0" cy="0" r="8" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"
            className="mk-ring" style={{ animationDelay: '0.2s' }} />
          <circle cx="0" cy="0" r="3" fill="rgba(255,255,255,0.4)"
            className="mk-ring" style={{ animationDelay: '0.1s' }} />

          {/* Spokes */}
          {spokes.map((s, i) => (
            <line key={i}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"
              className="mk-spoke"
              style={{ animationDelay: `${i * d}s` }}
              pathLength={1}
            />
          ))}

          {/* Nodes */}
          {nodes.map((n, i) => (
            <circle key={i}
              cx={n.cx} cy={n.cy} r={n.r}
              fill="rgba(255,255,255,0.8)"
              className="mk-node"
              style={{ animationDelay: `${n.i * d + 0.15}s` }}
            />
          ))}

          {/* Outer ring */}
          <circle cx="0" cy="0" r="75" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"
            className="mk-ring" style={{ animationDelay: `${dur * 0.3}s` }} />
        </g>
      </svg>
    </>
  )
}

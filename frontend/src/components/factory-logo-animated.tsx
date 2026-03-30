'use client'

export function FactoryLogoAnimated({ className = "w-60 h-60" }: { className?: string }) {
  const totalDuration = 4
  const spokeCount = 12
  const spokeDelay = totalDuration / spokeCount

  const spokes = [
    { x1: 0, y1: -30, x2: 0, y2: -110 },
    { x1: 15.5, y1: -25.9, x2: 56.4, y2: -94.2 },
    { x1: 25.9, y1: -15.5, x2: 94.2, y2: -56.4 },
    { x1: 30, y1: 0, x2: 110, y2: 0 },
    { x1: 25.9, y1: 15.5, x2: 94.2, y2: 56.4 },
    { x1: 15.5, y1: 25.9, x2: 56.4, y2: 94.2 },
    { x1: 0, y1: 30, x2: 0, y2: 110 },
    { x1: -15.5, y1: 25.9, x2: -56.4, y2: 94.2 },
    { x1: -25.9, y1: 15.5, x2: -94.2, y2: 56.4 },
    { x1: -30, y1: 0, x2: -110, y2: 0 },
    { x1: -25.9, y1: -15.5, x2: -94.2, y2: -56.4 },
    { x1: -15.5, y1: -25.9, x2: -56.4, y2: -94.2 },
  ]

  const secondarySpokes = [
    { x1: 7.8, y1: -29, x2: 28.2, y2: -105 },
    { x1: 21.2, y1: -21.2, x2: 77.8, y2: -77.8 },
    { x1: 29, y1: -7.8, x2: 105, y2: -28.2 },
    { x1: 29, y1: 7.8, x2: 105, y2: 28.2 },
    { x1: 21.2, y1: 21.2, x2: 77.8, y2: 77.8 },
    { x1: 7.8, y1: 29, x2: 28.2, y2: 105 },
    { x1: -7.8, y1: 29, x2: -28.2, y2: 105 },
    { x1: -21.2, y1: 21.2, x2: -77.8, y2: 77.8 },
    { x1: -29, y1: 7.8, x2: -105, y2: 28.2 },
    { x1: -29, y1: -7.8, x2: -105, y2: -28.2 },
    { x1: -21.2, y1: -21.2, x2: -77.8, y2: -77.8 },
    { x1: -7.8, y1: -29, x2: -28.2, y2: -105 },
  ]

  const outerNodes = [
    { cx: 0, cy: -85, r: 3 }, { cx: 0, cy: -110, r: 2 },
    { cx: 44, cy: -75, r: 2.5 }, { cx: 56.4, cy: -94.2, r: 2 },
    { cx: 75, cy: -44, r: 3 }, { cx: 94.2, cy: -56.4, r: 2 },
    { cx: 85, cy: 0, r: 3 }, { cx: 110, cy: 0, r: 2 },
    { cx: 75, cy: 44, r: 2.5 }, { cx: 94.2, cy: 56.4, r: 2 },
    { cx: 44, cy: 75, r: 3 }, { cx: 56.4, cy: 94.2, r: 2 },
    { cx: 0, cy: 85, r: 2.5 }, { cx: 0, cy: 110, r: 2 },
    { cx: -44, cy: 75, r: 3 }, { cx: -56.4, cy: 94.2, r: 2 },
    { cx: -75, cy: 44, r: 2.5 }, { cx: -94.2, cy: 56.4, r: 2 },
    { cx: -85, cy: 0, r: 3 }, { cx: -110, cy: 0, r: 2 },
    { cx: -75, cy: -44, r: 2.5 }, { cx: -94.2, cy: -56.4, r: 2 },
    { cx: -44, cy: -75, r: 3 }, { cx: -56.4, cy: -94.2, r: 2 },
  ]

  const branches = [
    { x1: 0, y1: -70, x2: 12, y2: -80, spokeIdx: 0 },
    { x1: 0, y1: -70, x2: -10, y2: -78, spokeIdx: 0 },
    { x1: 0, y1: -95, x2: 8, y2: -102, spokeIdx: 0 },
    { x1: 70, y1: 0, x2: 78, y2: -12, spokeIdx: 3 },
    { x1: 70, y1: 0, x2: 80, y2: 10, spokeIdx: 3 },
    { x1: 95, y1: 0, x2: 100, y2: -8, spokeIdx: 3 },
    { x1: 0, y1: 70, x2: -12, y2: 80, spokeIdx: 6 },
    { x1: 0, y1: 70, x2: 10, y2: 78, spokeIdx: 6 },
    { x1: 0, y1: 95, x2: -8, y2: 102, spokeIdx: 6 },
    { x1: -70, y1: 0, x2: -78, y2: 12, spokeIdx: 9 },
    { x1: -70, y1: 0, x2: -80, y2: -10, spokeIdx: 9 },
    { x1: -95, y1: 0, x2: -100, y2: 8, spokeIdx: 9 },
    { x1: 55, y1: -55, x2: 65, y2: -48, spokeIdx: 2 },
    { x1: 55, y1: -55, x2: 48, y2: -65, spokeIdx: 2 },
    { x1: -55, y1: 55, x2: -65, y2: 48, spokeIdx: 8 },
    { x1: -55, y1: 55, x2: -48, y2: 65, spokeIdx: 8 },
    { x1: 55, y1: 55, x2: 48, y2: 65, spokeIdx: 4 },
    { x1: 55, y1: 55, x2: 65, y2: 48, spokeIdx: 4 },
    { x1: -55, y1: -55, x2: -48, y2: -65, spokeIdx: 10 },
    { x1: -55, y1: -55, x2: -65, y2: -48, spokeIdx: 10 },
    { x1: 40, y1: -70, x2: 50, y2: -62, spokeIdx: 1 },
    { x1: -40, y1: 70, x2: -50, y2: 62, spokeIdx: 7 },
    { x1: 70, y1: 40, x2: 62, y2: 50, spokeIdx: 5 },
    { x1: -70, y1: -40, x2: -62, y2: -50, spokeIdx: 11 },
  ]

  const branchNodes = [
    { cx: 12, cy: -80, r: 1.2, spokeIdx: 0 }, { cx: -10, cy: -78, r: 1, spokeIdx: 0 },
    { cx: 8, cy: -102, r: 1, spokeIdx: 0 },
    { cx: 78, cy: -12, r: 1.2, spokeIdx: 3 }, { cx: 80, cy: 10, r: 1, spokeIdx: 3 },
    { cx: 100, cy: -8, r: 1, spokeIdx: 3 },
    { cx: -12, cy: 80, r: 1.2, spokeIdx: 6 }, { cx: 10, cy: 78, r: 1, spokeIdx: 6 },
    { cx: -8, cy: 102, r: 1, spokeIdx: 6 },
    { cx: -78, cy: 12, r: 1.2, spokeIdx: 9 }, { cx: -80, cy: -10, r: 1, spokeIdx: 9 },
    { cx: -100, cy: 8, r: 1, spokeIdx: 9 },
    { cx: 65, cy: -48, r: 1, spokeIdx: 2 }, { cx: 48, cy: -65, r: 1, spokeIdx: 2 },
    { cx: -65, cy: 48, r: 1, spokeIdx: 8 }, { cx: -48, cy: 65, r: 1, spokeIdx: 8 },
    { cx: 48, cy: 65, r: 1, spokeIdx: 4 }, { cx: 65, cy: 48, r: 1, spokeIdx: 4 },
    { cx: -48, cy: -65, r: 1, spokeIdx: 10 }, { cx: -65, cy: -48, r: 1, spokeIdx: 10 },
    { cx: 50, cy: -62, r: 1, spokeIdx: 1 }, { cx: -50, cy: 62, r: 1, spokeIdx: 7 },
    { cx: 62, cy: 50, r: 1, spokeIdx: 5 }, { cx: -62, cy: -50, r: 1, spokeIdx: 11 },
  ]

  return (
    <>
      <style>{`
        @keyframes trace-spoke {
          0% { stroke-dashoffset: 1; opacity: 0.3; filter: drop-shadow(0 0 0px rgba(255,255,255,0)); }
          15% { opacity: 1; filter: drop-shadow(0 0 6px rgba(255,255,255,0.8)); }
          30% { stroke-dashoffset: 0; opacity: 1; filter: drop-shadow(0 0 4px rgba(255,255,255,0.6)); }
          50% { opacity: 0.7; filter: drop-shadow(0 0 2px rgba(255,255,255,0.3)); }
          100% { stroke-dashoffset: 0; opacity: 0.5; filter: drop-shadow(0 0 0px rgba(255,255,255,0)); }
        }
        @keyframes node-pop {
          0% { opacity: 0; r: 0; filter: drop-shadow(0 0 0px rgba(255,255,255,0)); }
          20% { opacity: 1; filter: drop-shadow(0 0 8px rgba(255,255,255,0.9)); }
          40% { opacity: 1; filter: drop-shadow(0 0 4px rgba(255,255,255,0.5)); }
          100% { opacity: 0.7; filter: drop-shadow(0 0 0px rgba(255,255,255,0)); }
        }
        @keyframes ring-pulse {
          0% { opacity: 0; filter: drop-shadow(0 0 0px rgba(255,255,255,0)); }
          10% { opacity: 0.9; filter: drop-shadow(0 0 8px rgba(255,255,255,0.6)); }
          30% { opacity: 0.8; filter: drop-shadow(0 0 3px rgba(255,255,255,0.3)); }
          100% { opacity: 0.6; filter: drop-shadow(0 0 0px rgba(255,255,255,0)); }
        }
        @keyframes orbit-trace {
          0% { stroke-dashoffset: 754; opacity: 0; }
          50% { opacity: 0.15; }
          100% { stroke-dashoffset: 0; opacity: 0.06; }
        }
        .spoke-line {
          stroke-dasharray: 1;
          path-length: 1;
          animation: trace-spoke ${totalDuration}s ease-out infinite;
        }
        .secondary-spoke {
          stroke-dasharray: 1;
          path-length: 1;
          animation: trace-spoke ${totalDuration}s ease-out infinite;
        }
        .branch-line {
          stroke-dasharray: 1;
          path-length: 1;
          animation: trace-spoke ${totalDuration}s ease-out infinite;
        }
        .node-glow {
          animation: node-pop ${totalDuration}s ease-out infinite;
        }
        .ring-glow {
          animation: ring-pulse ${totalDuration * 1.5}s ease-out infinite;
        }
        .orbit-ring {
          animation: orbit-trace ${totalDuration * 2}s ease-out infinite;
        }
      `}</style>
      <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className={className}>
        <defs>
          <radialGradient id="glow-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        <circle cx="200" cy="200" r="180" fill="url(#glow-bg)" />

        <g transform="translate(200,200)">
          {/* Core rings with pulse */}
          <circle cx="0" cy="0" r="28" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5"
            className="ring-glow" style={{ animationDelay: '0s' }} />
          <circle cx="0" cy="0" r="20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1"
            className="ring-glow" style={{ animationDelay: '0.2s' }} />
          <circle cx="0" cy="0" r="12" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"
            className="ring-glow" style={{ animationDelay: '0.4s' }} />
          <circle cx="0" cy="0" r="6" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="1"
            className="ring-glow" style={{ animationDelay: '0.1s' }} />

          {/* Inner detail rings */}
          <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="3 5" />
          <circle cx="0" cy="0" r="50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />

          {/* Primary spokes — trace one by one */}
          {spokes.map((s, i) => (
            <line key={`spoke-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="0.7"
              className="spoke-line"
              style={{ animationDelay: `${i * spokeDelay}s` }}
              pathLength={1}
            />
          ))}

          {/* Secondary spokes — trace with offset */}
          {secondarySpokes.map((s, i) => (
            <line key={`sec-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="0.4"
              className="secondary-spoke"
              style={{ animationDelay: `${i * spokeDelay + spokeDelay * 0.5}s` }}
              pathLength={1}
            />
          ))}

          {/* Outer nodes — pop when their spoke lights up */}
          {outerNodes.map((n, i) => (
            <circle key={`node-${i}`}
              cx={n.cx} cy={n.cy} r={n.r}
              fill="rgba(255,255,255,0.8)"
              className="node-glow"
              style={{ animationDelay: `${Math.floor(i / 2) * spokeDelay + 0.15}s` }}
            />
          ))}

          {/* Mid-range nodes */}
          {[
            { cx: 20, cy: -72 }, { cx: 55, cy: -55 }, { cx: 72, cy: -20 },
            { cx: 72, cy: 20 }, { cx: 55, cy: 55 }, { cx: 20, cy: 72 },
            { cx: -20, cy: 72 }, { cx: -55, cy: 55 }, { cx: -72, cy: 20 },
            { cx: -72, cy: -20 }, { cx: -55, cy: -55 }, { cx: -20, cy: -72 },
          ].map((n, i) => (
            <circle key={`mid-${i}`}
              cx={n.cx} cy={n.cy} r={1.5}
              fill="rgba(255,255,255,0.5)"
              className="node-glow"
              style={{ animationDelay: `${i * spokeDelay + spokeDelay * 0.7}s` }}
            />
          ))}

          {/* Branch lines */}
          {branches.map((b, i) => (
            <line key={`branch-${i}`}
              x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.5"
              className="branch-line"
              style={{ animationDelay: `${b.spokeIdx * spokeDelay + 0.2}s` }}
              pathLength={1}
            />
          ))}

          {/* Branch endpoint nodes */}
          {branchNodes.map((n, i) => (
            <circle key={`bnode-${i}`}
              cx={n.cx} cy={n.cy} r={n.r}
              fill="rgba(255,255,255,0.6)"
              className="node-glow"
              style={{ animationDelay: `${n.spokeIdx * spokeDelay + 0.3}s` }}
            />
          ))}

          {/* Outer orbital ring */}
          <circle cx="0" cy="0" r="120" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"
            className="orbit-ring"
            strokeDasharray="754"
            style={{ animationDelay: `${totalDuration * 0.3}s` }}
          />
          <circle cx="0" cy="0" r="140" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"
            strokeDasharray="880"
            className="orbit-ring"
            style={{ animationDelay: `${totalDuration * 0.5}s` }}
          />

          {/* Outermost scattered nodes */}
          {[
            { cx: 0, cy: -130 }, { cx: 65, cy: -112 }, { cx: 112, cy: -65 },
            { cx: 130, cy: 0 }, { cx: 112, cy: 65 }, { cx: 65, cy: 112 },
            { cx: 0, cy: 130 }, { cx: -65, cy: 112 }, { cx: -112, cy: 65 },
            { cx: -130, cy: 0 }, { cx: -112, cy: -65 }, { cx: -65, cy: -112 },
          ].map((n, i) => (
            <circle key={`outer-${i}`}
              cx={n.cx} cy={n.cy} r={1.5}
              fill="rgba(255,255,255,0.3)"
              className="node-glow"
              style={{ animationDelay: `${i * spokeDelay + totalDuration * 0.4}s` }}
            />
          ))}

          {/* Connecting arcs */}
          <g fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4">
            <path d="M 0,-130 Q 35,-125 65,-112"/>
            <path d="M 65,-112 Q 92,-92 112,-65"/>
            <path d="M 112,-65 Q 125,-35 130,0"/>
            <path d="M 130,0 Q 125,35 112,65"/>
            <path d="M 112,65 Q 92,92 65,112"/>
            <path d="M 65,112 Q 35,125 0,130"/>
            <path d="M 0,130 Q -35,125 -65,112"/>
            <path d="M -65,112 Q -92,92 -112,65"/>
            <path d="M -112,65 Q -125,35 -130,0"/>
            <path d="M -130,0 Q -125,-35 -112,-65"/>
            <path d="M -112,-65 Q -92,-92 -65,-112"/>
            <path d="M -65,-112 Q -35,-125 0,-130"/>
          </g>
        </g>
      </svg>
    </>
  )
}

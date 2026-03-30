export function FactoryLogo({
  className = "w-6 h-6",
  variant = "mark",
}: {
  className?: string
  variant?: "mark" | "full"
}) {
  if (variant === "mark") {
    return (
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className={className}>
        <g transform="translate(100,100)">
          {/* Core rings — thicker for small sizes */}
          <circle cx="0" cy="0" r="14" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5"/>
          <circle cx="0" cy="0" r="8" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"/>
          <circle cx="0" cy="0" r="3" fill="rgba(255,255,255,0.4)"/>

          {/* 12 primary spokes */}
          <g stroke="rgba(255,255,255,0.6)" strokeWidth="1.5">
            <line x1="0" y1="-16" x2="0" y2="-65"/>
            <line x1="8" y1="-13.9" x2="32.5" y2="-56.3"/>
            <line x1="13.9" y1="-8" x2="56.3" y2="-32.5"/>
            <line x1="16" y1="0" x2="65" y2="0"/>
            <line x1="13.9" y1="8" x2="56.3" y2="32.5"/>
            <line x1="8" y1="13.9" x2="32.5" y2="56.3"/>
            <line x1="0" y1="16" x2="0" y2="65"/>
            <line x1="-8" y1="13.9" x2="-32.5" y2="56.3"/>
            <line x1="-13.9" y1="8" x2="-56.3" y2="32.5"/>
            <line x1="-16" y1="0" x2="-65" y2="0"/>
            <line x1="-13.9" y1="-8" x2="-56.3" y2="-32.5"/>
            <line x1="-8" y1="-13.9" x2="-32.5" y2="-56.3"/>
          </g>

          {/* Endpoint nodes — larger for visibility */}
          <g fill="rgba(255,255,255,0.8)">
            <circle cx="0" cy="-50" r="4"/>
            <circle cx="0" cy="-65" r="3"/>
            <circle cx="25" cy="-43" r="3.5"/>
            <circle cx="43" cy="-25" r="4"/>
            <circle cx="50" cy="0" r="3.5"/>
            <circle cx="65" cy="0" r="3"/>
            <circle cx="43" cy="25" r="4"/>
            <circle cx="25" cy="43" r="3.5"/>
            <circle cx="0" cy="50" r="4"/>
            <circle cx="0" cy="65" r="3"/>
            <circle cx="-25" cy="43" r="3.5"/>
            <circle cx="-43" cy="25" r="4"/>
            <circle cx="-50" cy="0" r="3.5"/>
            <circle cx="-65" cy="0" r="3"/>
            <circle cx="-43" cy="-25" r="4"/>
            <circle cx="-25" cy="-43" r="3.5"/>
          </g>

          {/* Outer ring */}
          <circle cx="0" cy="0" r="75" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
        </g>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g transform="translate(200,200)">
        {/* Core rings */}
        <circle cx="0" cy="0" r="28" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5"/>
        <circle cx="0" cy="0" r="20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1"/>
        <circle cx="0" cy="0" r="12" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"/>
        <circle cx="0" cy="0" r="6" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>

        {/* Inner detail ring */}
        <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="3 5"/>
        <circle cx="0" cy="0" r="50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5"/>

        {/* Radial spokes - 12 primary */}
        <g stroke="rgba(255,255,255,0.5)" strokeWidth="0.7">
          <line x1="0" y1="-30" x2="0" y2="-110"/>
          <line x1="15.5" y1="-25.9" x2="56.4" y2="-94.2"/>
          <line x1="25.9" y1="-15.5" x2="94.2" y2="-56.4"/>
          <line x1="30" y1="0" x2="110" y2="0"/>
          <line x1="25.9" y1="15.5" x2="94.2" y2="56.4"/>
          <line x1="15.5" y1="25.9" x2="56.4" y2="94.2"/>
          <line x1="0" y1="30" x2="0" y2="110"/>
          <line x1="-15.5" y1="25.9" x2="-56.4" y2="94.2"/>
          <line x1="-25.9" y1="15.5" x2="-94.2" y2="56.4"/>
          <line x1="-30" y1="0" x2="-110" y2="0"/>
          <line x1="-25.9" y1="-15.5" x2="-94.2" y2="-56.4"/>
          <line x1="-15.5" y1="-25.9" x2="-56.4" y2="-94.2"/>
        </g>

        {/* Secondary finer spokes */}
        <g stroke="rgba(255,255,255,0.25)" strokeWidth="0.4">
          <line x1="7.8" y1="-29" x2="28.2" y2="-105"/>
          <line x1="21.2" y1="-21.2" x2="77.8" y2="-77.8"/>
          <line x1="29" y1="-7.8" x2="105" y2="-28.2"/>
          <line x1="29" y1="7.8" x2="105" y2="28.2"/>
          <line x1="21.2" y1="21.2" x2="77.8" y2="77.8"/>
          <line x1="7.8" y1="29" x2="28.2" y2="105"/>
          <line x1="-7.8" y1="29" x2="-28.2" y2="105"/>
          <line x1="-21.2" y1="21.2" x2="-77.8" y2="77.8"/>
          <line x1="-29" y1="7.8" x2="-105" y2="28.2"/>
          <line x1="-29" y1="-7.8" x2="-105" y2="-28.2"/>
          <line x1="-21.2" y1="-21.2" x2="-77.8" y2="-77.8"/>
          <line x1="-7.8" y1="-29" x2="-28.2" y2="-105"/>
        </g>

        {/* Outer node circles */}
        <g fill="rgba(255,255,255,0.7)">
          <circle cx="0" cy="-85" r="3"/>
          <circle cx="0" cy="-110" r="2"/>
          <circle cx="44" cy="-75" r="2.5"/>
          <circle cx="56.4" cy="-94.2" r="2"/>
          <circle cx="75" cy="-44" r="3"/>
          <circle cx="94.2" cy="-56.4" r="2"/>
          <circle cx="85" cy="0" r="3"/>
          <circle cx="110" cy="0" r="2"/>
          <circle cx="75" cy="44" r="2.5"/>
          <circle cx="94.2" cy="56.4" r="2"/>
          <circle cx="44" cy="75" r="3"/>
          <circle cx="56.4" cy="94.2" r="2"/>
          <circle cx="0" cy="85" r="2.5"/>
          <circle cx="0" cy="110" r="2"/>
          <circle cx="-44" cy="75" r="3"/>
          <circle cx="-56.4" cy="94.2" r="2"/>
          <circle cx="-75" cy="44" r="2.5"/>
          <circle cx="-94.2" cy="56.4" r="2"/>
          <circle cx="-85" cy="0" r="3"/>
          <circle cx="-110" cy="0" r="2"/>
          <circle cx="-75" cy="-44" r="2.5"/>
          <circle cx="-94.2" cy="-56.4" r="2"/>
          <circle cx="-44" cy="-75" r="3"/>
          <circle cx="-56.4" cy="-94.2" r="2"/>
        </g>

        {/* Mid-range nodes */}
        <g fill="rgba(255,255,255,0.4)">
          <circle cx="20" cy="-72" r="1.5"/>
          <circle cx="55" cy="-55" r="1.5"/>
          <circle cx="72" cy="-20" r="1.5"/>
          <circle cx="72" cy="20" r="1.5"/>
          <circle cx="55" cy="55" r="1.5"/>
          <circle cx="20" cy="72" r="1.5"/>
          <circle cx="-20" cy="72" r="1.5"/>
          <circle cx="-55" cy="55" r="1.5"/>
          <circle cx="-72" cy="20" r="1.5"/>
          <circle cx="-72" cy="-20" r="1.5"/>
          <circle cx="-55" cy="-55" r="1.5"/>
          <circle cx="-20" cy="-72" r="1.5"/>
        </g>

        {/* Branch lines */}
        <g stroke="rgba(255,255,255,0.3)" strokeWidth="0.5">
          <line x1="0" y1="-70" x2="12" y2="-80"/>
          <line x1="0" y1="-70" x2="-10" y2="-78"/>
          <line x1="0" y1="-95" x2="8" y2="-102"/>
          <line x1="70" y1="0" x2="78" y2="-12"/>
          <line x1="70" y1="0" x2="80" y2="10"/>
          <line x1="95" y1="0" x2="100" y2="-8"/>
          <line x1="0" y1="70" x2="-12" y2="80"/>
          <line x1="0" y1="70" x2="10" y2="78"/>
          <line x1="0" y1="95" x2="-8" y2="102"/>
          <line x1="-70" y1="0" x2="-78" y2="12"/>
          <line x1="-70" y1="0" x2="-80" y2="-10"/>
          <line x1="-95" y1="0" x2="-100" y2="8"/>
          <line x1="55" y1="-55" x2="65" y2="-48"/>
          <line x1="55" y1="-55" x2="48" y2="-65"/>
          <line x1="-55" y1="55" x2="-65" y2="48"/>
          <line x1="-55" y1="55" x2="-48" y2="65"/>
          <line x1="55" y1="55" x2="48" y2="65"/>
          <line x1="55" y1="55" x2="65" y2="48"/>
          <line x1="-55" y1="-55" x2="-48" y2="-65"/>
          <line x1="-55" y1="-55" x2="-65" y2="-48"/>
          <line x1="40" y1="-70" x2="50" y2="-62"/>
          <line x1="-40" y1="70" x2="-50" y2="62"/>
          <line x1="70" y1="40" x2="62" y2="50"/>
          <line x1="-70" y1="-40" x2="-62" y2="-50"/>
        </g>

        {/* Branch endpoint nodes */}
        <g fill="rgba(255,255,255,0.5)">
          <circle cx="12" cy="-80" r="1.2"/>
          <circle cx="-10" cy="-78" r="1"/>
          <circle cx="8" cy="-102" r="1"/>
          <circle cx="78" cy="-12" r="1.2"/>
          <circle cx="80" cy="10" r="1"/>
          <circle cx="100" cy="-8" r="1"/>
          <circle cx="-12" cy="80" r="1.2"/>
          <circle cx="10" cy="78" r="1"/>
          <circle cx="-8" cy="102" r="1"/>
          <circle cx="-78" cy="12" r="1.2"/>
          <circle cx="-80" cy="-10" r="1"/>
          <circle cx="-100" cy="8" r="1"/>
          <circle cx="65" cy="-48" r="1"/>
          <circle cx="48" cy="-65" r="1"/>
          <circle cx="-65" cy="48" r="1"/>
          <circle cx="-48" cy="65" r="1"/>
          <circle cx="48" cy="65" r="1"/>
          <circle cx="65" cy="48" r="1"/>
          <circle cx="-48" cy="-65" r="1"/>
          <circle cx="-65" cy="-48" r="1"/>
          <circle cx="50" cy="-62" r="1"/>
          <circle cx="-50" cy="62" r="1"/>
          <circle cx="62" cy="50" r="1"/>
          <circle cx="-62" cy="-50" r="1"/>
        </g>

        {/* Outer orbital ring */}
        <circle cx="0" cy="0" r="120" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
        <circle cx="0" cy="0" r="140" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" strokeDasharray="2 8"/>

        {/* Outermost scattered nodes */}
        <g fill="rgba(255,255,255,0.2)">
          <circle cx="0" cy="-130" r="1.5"/>
          <circle cx="65" cy="-112" r="1"/>
          <circle cx="112" cy="-65" r="1.5"/>
          <circle cx="130" cy="0" r="1"/>
          <circle cx="112" cy="65" r="1.5"/>
          <circle cx="65" cy="112" r="1"/>
          <circle cx="0" cy="130" r="1.5"/>
          <circle cx="-65" cy="112" r="1"/>
          <circle cx="-112" cy="65" r="1.5"/>
          <circle cx="-130" cy="0" r="1"/>
          <circle cx="-112" cy="-65" r="1.5"/>
          <circle cx="-65" cy="-112" r="1"/>
        </g>

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
  )
}

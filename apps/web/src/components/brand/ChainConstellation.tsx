/**
 * Signature visual: a quiet abstract workflow chain.
 * Used on the landing hero — the one memorable element of the brand system.
 */
export function ChainConstellation({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden>
      <svg viewBox="0 0 640 360" className="h-full w-full" fill="none">
        <defs>
          <linearGradient id="chain-stroke" x1="0" y1="0" x2="640" y2="0">
            <stop offset="0%" stopColor="hsl(252 56% 54%)" stopOpacity="0.15" />
            <stop offset="45%" stopColor="hsl(252 56% 54%)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="hsl(200 80% 55%)" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="node-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(0 0% 100%)" />
            <stop offset="100%" stopColor="hsl(252 70% 97%)" />
          </linearGradient>
          <filter id="soft-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ambient orbs */}
        <circle cx="120" cy="80" r="56" fill="hsl(252 70% 70% / 0.08)" className="animate-float" />
        <circle
          cx="520"
          cy="280"
          r="72"
          fill="hsl(200 80% 70% / 0.07)"
          className="animate-float delay-300"
        />

        {/* connection paths */}
        <path
          d="M96 188 C160 120, 210 120, 268 168"
          stroke="url(#chain-stroke)"
          strokeWidth="1.6"
          strokeDasharray="5 7"
          className="animate-pulse-line"
        />
        <path
          d="M268 168 C330 220, 360 230, 420 176"
          stroke="url(#chain-stroke)"
          strokeWidth="1.6"
          strokeDasharray="5 7"
          className="animate-pulse-line delay-200"
        />
        <path
          d="M420 176 C480 120, 510 140, 560 200"
          stroke="url(#chain-stroke)"
          strokeWidth="1.6"
          strokeDasharray="5 7"
          className="animate-pulse-line delay-400"
        />
        {/* branch */}
        <path
          d="M268 168 C300 90, 340 70, 390 96"
          stroke="hsl(252 56% 54% / 0.28)"
          strokeWidth="1.25"
          strokeDasharray="4 6"
        />

        {/* nodes */}
        <g filter="url(#soft-glow)">
          <Node x={96} y={188} label="Start" kind="start" />
          <Node x={268} y={168} label="Prompt" kind="prompt" />
          <Node x={420} y={176} label="Decide" kind="decision" />
          <Node x={560} y={200} label="Output" kind="output" />
          <Node x={390} y={96} label="Alt" kind="prompt" compact />
        </g>
      </svg>
    </div>
  )
}

function Node({
  x,
  y,
  label,
  kind,
  compact = false,
}: {
  x: number
  y: number
  label: string
  kind: 'start' | 'prompt' | 'decision' | 'output'
  compact?: boolean
}) {
  const w = compact ? 64 : 88
  const h = compact ? 34 : 42
  const accent =
    kind === 'start'
      ? 'hsl(252 56% 54%)'
      : kind === 'output'
        ? 'hsl(158 45% 36%)'
        : kind === 'decision'
          ? 'hsl(38 80% 48%)'
          : 'hsl(240 8% 40%)'

  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect
        width={w}
        height={h}
        rx={12}
        fill="url(#node-fill)"
        stroke="hsl(40 10% 84%)"
        strokeWidth="1"
      />
      <circle cx={14} cy={h / 2} r={3.5} fill={accent} />
      <text
        x={24}
        y={h / 2 + 4}
        fill="hsl(240 8% 18%)"
        fontSize={compact ? 10 : 11.5}
        fontFamily="Plus Jakarta Sans, sans-serif"
        fontWeight={600}
        style={{ fontFeatureSettings: '"ss01" on, "cv11" on' }}
      >
        {label}
      </text>
    </g>
  )
}

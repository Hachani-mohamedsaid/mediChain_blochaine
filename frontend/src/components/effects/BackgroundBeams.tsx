import { cn } from '../../lib/utils'

export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      <svg
        className="absolute h-full w-full opacity-[0.12]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="beam-a" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0D9488" stopOpacity="0" />
            <stop offset="50%" stopColor="#22D3EE" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0D9488" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[...Array(8)].map((_, i) => (
          <line
            key={i}
            x1={-100 + i * 180}
            y1="0"
            x2={200 + i * 180}
            y2="800"
            stroke="url(#beam-a)"
            strokeWidth="1.5"
            className="animate-[beam-drift_12s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 0.7}s` }}
          />
        ))}
      </svg>
      <style>{`
        @keyframes beam-drift {
          0%, 100% { transform: translateX(0); opacity: 0.4; }
          50% { transform: translateX(24px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

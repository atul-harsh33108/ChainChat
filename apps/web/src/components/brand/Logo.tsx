import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  markClassName?: string
  showWordmark?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: { mark: 'h-6 w-6', text: 'text-base' },
  md: { mark: 'h-7 w-7', text: 'text-lg' },
  lg: { mark: 'h-9 w-9', text: 'text-xl' },
}

/** ChainChat wordmark + abstract link mark. */
export function Logo({ className, markClassName, showWordmark = true, size = 'md' }: LogoProps) {
  const s = sizes[size]
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'relative inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow',
          s.mark,
          markClassName
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none">
          <path
            d="M9.5 8.5a3.2 3.2 0 0 1 4.55-.15l.7.65a3.2 3.2 0 0 1 0 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M14.5 15.5a3.2 3.2 0 0 1-4.55.15l-.7-.65a3.2 3.2 0 0 1 0-4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {showWordmark && (
        <span className={cn('font-display font-semibold tracking-tight text-foreground', s.text)}>
          ChainChat
        </span>
      )}
    </div>
  )
}

import { useLayoutEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MarkdownRenderer } from '@/components/workflow/markdown-renderer'
import { cn } from '@/lib/utils'

interface StepOutputPanelProps {
  stepKey: string
  outputs: { text?: string; json?: unknown; format_error?: string } | null
  /** The Output_Node's display format ("text" | "markdown" | "json"), or
   * null for a Prompt_Node step, which is always shown as plain text since
   * there is no format selector for it. */
  format: string | null
  className?: string
}

/** How many lines of output are visible before a "collapsed" step's content
 * gets clipped and an expand button appears. Long JSON/markdown outputs are
 * common enough (see the LangChain/LlamaIndex example in the builder) that
 * without this, a single step can push the rest of the run list off screen. */
const COLLAPSED_MAX_HEIGHT = 'max-h-40'

/**
 * Renders a single step's output, format-aware (Markdown gets a real
 * renderer, JSON gets a pretty-printed block, everything else is plain
 * whitespace-preserving text), with a button to expand it into a full-size
 * dialog for long content.
 */
export function StepOutputPanel({ stepKey, outputs, format, className }: StepOutputPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Only offer "Expand" when the content actually exceeds the collapsed
  // clip -- a two-line output shouldn't get a button that does nothing
  // useful. Re-checked whenever the rendered output changes.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [outputs, format])

  if (!outputs) return null

  const hasJson = format === 'json' && outputs.json !== undefined
  const hasContent = hasJson || !!outputs.text
  if (!hasContent && !outputs.format_error) return null

  const body = (
    <>
      {outputs.format_error && (
        <p className="text-xs text-amber-600 mb-1">{outputs.format_error}</p>
      )}
      {hasJson ? (
        <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-2">
          {JSON.stringify(outputs.json, null, 2)}
        </pre>
      ) : format === 'markdown' ? (
        <MarkdownRenderer content={outputs.text || ''} />
      ) : (
        outputs.text && <p className="text-sm whitespace-pre-wrap">{outputs.text}</p>
      )}
    </>
  )

  return (
    <div className={cn('relative mt-1', className)}>
      <div
        ref={contentRef}
        className={cn('overflow-hidden', overflowing && COLLAPSED_MAX_HEIGHT)}
      >
        {body}
      </div>
      {overflowing && (
        <>
          {/* A gradient fade hints there's more content below the clip, and
           * the button to expand sits on top of it. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
          <Button
            variant="outline"
            size="sm"
            className="absolute bottom-1 right-1 h-6 gap-1 bg-card px-2 text-xs"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="h-3 w-3" />
            Expand
          </Button>
        </>
      )}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{stepKey}</DialogTitle>
          </DialogHeader>
          <div>{body}</div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Renders a step's text output as GitHub-flavoured Markdown (headings,
 * lists, tables, bold/italic, code blocks, links) instead of printing the
 * raw `**bold**`/`## heading` syntax verbatim. There's no
 * `@tailwindcss/typography` plugin installed, so element styling is applied
 * directly via `components` overrides rather than a `prose` class.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('text-sm leading-relaxed [&>*:first-child]:mt-0', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => <h1 className="mt-4 mb-2 text-lg font-semibold" {...props} />,
          h2: ({ ...props }) => <h2 className="mt-4 mb-2 text-base font-semibold" {...props} />,
          h3: ({ ...props }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold" {...props} />,
          h4: ({ ...props }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold" {...props} />,
          p: ({ ...props }) => <p className="mb-2" {...props} />,
          ul: ({ ...props }) => <ul className="mb-2 ml-5 list-disc space-y-0.5" {...props} />,
          ol: ({ ...props }) => <ol className="mb-2 ml-5 list-decimal space-y-0.5" {...props} />,
          li: ({ ...props }) => <li {...props} />,
          a: ({ ...props }) => (
            <a className="underline text-primary hover:no-underline" target="_blank" rel="noreferrer" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="mb-2 border-l-2 pl-3 italic text-muted-foreground" {...props} />
          ),
          code: ({ className: codeClassName, ...props }) => {
            const isBlock = /language-/.test(codeClassName || '')
            return isBlock ? (
              <code className={cn('text-xs', codeClassName)} {...props} />
            ) : (
              <code
                className="rounded bg-muted px-1 py-0.5 text-xs font-mono"
                {...props}
              />
            )
          },
          pre: ({ ...props }) => (
            <pre className="mb-2 overflow-x-auto rounded bg-muted p-2 text-xs" {...props} />
          ),
          table: ({ ...props }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...props} />
            </div>
          ),
          th: ({ ...props }) => (
            <th className="border border-border bg-muted px-2 py-1 text-left font-medium" {...props} />
          ),
          td: ({ ...props }) => <td className="border border-border px-2 py-1" {...props} />,
          hr: ({ ...props }) => <hr className="my-3 border-border" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

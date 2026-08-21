import { useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { MessageSquare, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useComments, useCreateComment, useDeleteComment } from '@/hooks/comments'
import { toast } from '@/hooks/use-toast'

/**
 * Discussion thread for a workflow. Comments can be threaded against a
 * specific version and are visible to all workspace members.
 */
export function CommentPanel({
  workflowId,
  versionId,
}: {
  workflowId: string
  versionId?: string
}) {
  const { user } = useUser()
  const { data: comments, isLoading } = useComments(workflowId)
  const createComment = useCreateComment(workflowId)
  const deleteComment = useDeleteComment(workflowId)
  const [draft, setDraft] = useState('')

  const submit = async () => {
    if (!draft.trim()) return
    try {
      await createComment.mutateAsync({ content: draft.trim(), versionId })
      setDraft('')
    } catch {
      toast({ title: 'Could not post comment', variant: 'destructive' })
    }
  }

  const remove = async (commentId: string) => {
    try {
      await deleteComment.mutateAsync(commentId)
    } catch {
      toast({ title: 'Could not delete comment', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        <h2 className="font-semibold">Comments</h2>
      </div>

      <div className="space-y-2 max-h-64 overflow-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading comments…</p>
        ) : comments?.length ? (
          comments.map((c) => (
            <div key={c.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {c.author_id === user?.id ? 'You' : 'Collaborator'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Delete comment"
                  onClick={() => remove(c.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <p className="whitespace-pre-wrap">{c.content}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
      </div>

      <div className="space-y-2">
        <Textarea
          rows={3}
          placeholder="Leave a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!draft.trim() || createComment.isPending}>
            <Send className="h-4 w-4 mr-2" />
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}
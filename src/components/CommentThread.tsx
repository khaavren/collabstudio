import { useState } from "react";
import { timeAgo } from "@/lib/utils";
import type { Comment } from "@/lib/types";

type CommentThreadProps = {
  comments: Comment[];
  onAddComment: (content: string) => Promise<void>;
};

export function CommentThread({ comments, onAddComment }: CommentThreadProps) {
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    setIsSubmitting(true);
    await onAddComment(content);
    setDraft("");
    setIsSubmitting(false);
  }

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-medium text-[var(--foreground)]">Comments</h4>

      <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
        {comments.map((comment) => (
          <article className="flex items-start gap-2" key={comment.id}>
            <img
              alt={comment.author}
              className="h-7 w-7 rounded-full border border-[var(--border)]"
              src={comment.avatar_url}
            />
            <div className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
              <p className="text-xs text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--foreground)]">{comment.author}</span>
                {" · "}
                {timeAgo(comment.created_at)}
              </p>
              <p className="mt-1 text-sm text-[var(--foreground)]">{comment.content}</p>
            </div>
          </article>
        ))}
      </div>

      <form className="space-y-2" onSubmit={handleSubmit}>
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Leave a comment"
          value={draft}
        />
        <button
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--foreground)] disabled:opacity-60"
          disabled={isSubmitting || !draft.trim()}
          type="submit"
        >
          {isSubmitting ? "Posting..." : "Post"}
        </button>
      </form>
    </section>
  );
}

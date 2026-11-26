import { useState } from "react";
import { useFetcher } from "react-router";
import { NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { noteDraft } from "~/modules/lesson-notes";
import type { NoteDraft, NoteDraftStatus } from "~/modules/lesson-notes";

// Laid out like CommentThread's card, so the two read as one set of tools
// for the lesson rather than two unrelated widgets.
export function LessonNote({
  note,
}: {
  note: { body: string; updatedAt: string } | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const draft = noteDraft({
    draft: body,
    saved: note,
    limit: MAX_NOTE_LENGTH,
    isSaving: fetcher.state !== "idle",
    error: fetcher.data?.error,
  });

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <NotebookPen className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Your notes</h2>
        </div>

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson."
            aria-label="Your notes"
            className="min-h-28 resize-y"
          />

          <NoteFooter draft={draft} />

          <p className="text-xs text-muted-foreground">
            Private — only you can read your notes.
          </p>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteFooter({ draft }: { draft: NoteDraft }) {
  const { length, tooLong, canSave, status } = draft;
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={!canSave}>
        {status.kind === "saving" ? "Saving..." : "Save note"}
      </Button>
      <NoteStatus status={status} />
      <span
        className={cn(
          "ml-auto text-xs",
          tooLong ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {length} / {MAX_NOTE_LENGTH}
      </span>
    </div>
  );
}

function NoteStatus({ status }: { status: NoteDraftStatus }) {
  switch (status.kind) {
    case "error":
      return <span className="text-sm text-destructive">{status.message}</span>;
    case "unsaved":
      return (
        <span className="text-xs text-muted-foreground">Unsaved changes</span>
      );
    case "saved":
      return (
        <span
          suppressHydrationWarning
          className="text-xs text-muted-foreground"
        >
          Saved {formatRelativeTime(status.updatedAt)}
        </span>
      );
    default:
      return null;
  }
}

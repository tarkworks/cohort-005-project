export type SavedNote = { body: string; updatedAt: string };

export type NoteDraftInput = {
  draft: string;
  saved: SavedNote | null;
  limit: number;
  isSaving: boolean;
  error: string | undefined;
};

export type NoteDraftStatus =
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "unsaved" }
  | { kind: "saved"; updatedAt: string }
  | { kind: "empty" };

export type NoteDraft = {
  length: number;
  tooLong: boolean;
  canSave: boolean;
  status: NoteDraftStatus;
};

export function describeDraft(input: NoteDraftInput): NoteDraft {
  const { draft, saved, limit, isSaving, error } = input;
  // The server trims before it stores, so compare what it would store.
  const trimmed = draft.trim();
  const tooLong = trimmed.length > limit;
  const changed = trimmed !== saved?.body;
  const canSave = !isSaving && !tooLong && trimmed.length > 0 && changed;

  return {
    length: draft.length,
    tooLong,
    canSave,
    status: statusOf({ isSaving, error, changed, trimmed, saved }),
  };
}

function statusOf({
  isSaving,
  error,
  changed,
  trimmed,
  saved,
}: {
  isSaving: boolean;
  error: string | undefined;
  changed: boolean;
  trimmed: string;
  saved: SavedNote | null;
}): NoteDraftStatus {
  if (isSaving) return { kind: "saving" };
  if (error) return { kind: "error", message: error };
  if (changed && trimmed.length > 0) return { kind: "unsaved" };
  if (saved && !changed) return { kind: "saved", updatedAt: saved.updatedAt };
  return { kind: "empty" };
}

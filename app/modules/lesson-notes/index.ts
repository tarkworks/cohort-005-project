import { describeDraft } from "./lib/draft";
import type { NoteDraft, NoteDraftInput } from "./lib/draft";

export type { NoteDraft, NoteDraftInput, NoteDraftStatus } from "./lib/draft";

/**
 * What the lesson note editor shows for the text in the box: the character
 * count, whether Save is enabled, and the status line beside it.
 */
export function noteDraft(input: NoteDraftInput): NoteDraft {
  return describeDraft(input);
}

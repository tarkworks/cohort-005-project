import { describe, it, expect } from "vitest";
import { noteDraft } from "../index";
import type { NoteDraftInput } from "../index";

const saved = {
  body: "Result types beat throwing.",
  updatedAt: "2026-11-20T10:00:00.000Z",
};

function draft(overrides: Partial<NoteDraftInput>) {
  return noteDraft({
    draft: "",
    saved: null,
    limit: 20,
    isSaving: false,
    error: undefined,
    ...overrides,
  });
}

describe("noteDraft", () => {
  it("has nothing to save before the Student writes anything", () => {
    expect(draft({})).toEqual({
      length: 0,
      tooLong: false,
      canSave: false,
      status: { kind: "empty" },
    });
  });

  it("can save new text and calls it unsaved", () => {
    const result = draft({ draft: "First thought" });
    expect(result.canSave).toBe(true);
    expect(result.status).toEqual({ kind: "unsaved" });
    expect(result.length).toBe(13);
  });

  it("shows when the saved note was last edited while the text matches it", () => {
    const result = draft({ draft: saved.body, saved, limit: 100 });
    expect(result.canSave).toBe(false);
    expect(result.status).toEqual({
      kind: "saved",
      updatedAt: saved.updatedAt,
    });
  });

  it("ignores surrounding whitespace, as the server trims it", () => {
    const result = draft({ draft: `  ${saved.body}\n`, saved, limit: 100 });
    expect(result.canSave).toBe(false);
    expect(result.status.kind).toBe("saved");
  });

  it("treats an edit to the saved note as unsaved", () => {
    const result = draft({ draft: `${saved.body}!`, saved, limit: 100 });
    expect(result.canSave).toBe(true);
    expect(result.status).toEqual({ kind: "unsaved" });
  });

  it("will not save whitespace alone", () => {
    const result = draft({ draft: "   " });
    expect(result.canSave).toBe(false);
    expect(result.status).toEqual({ kind: "empty" });
  });

  it("will not save a blanked-out note", () => {
    const result = draft({ draft: "", saved, limit: 100 });
    expect(result.canSave).toBe(false);
    expect(result.status).toEqual({ kind: "empty" });
  });

  it("blocks a note over the limit", () => {
    const result = draft({ draft: "x".repeat(21) });
    expect(result.tooLong).toBe(true);
    expect(result.canSave).toBe(false);
  });

  it("allows a note exactly at the limit", () => {
    const result = draft({ draft: "x".repeat(20) });
    expect(result.tooLong).toBe(false);
    expect(result.canSave).toBe(true);
  });

  it("counts the characters as typed, whitespace included", () => {
    expect(draft({ draft: " ab " }).length).toBe(4);
  });

  it("does not save twice while a save is in flight", () => {
    const result = draft({ draft: "Pending", isSaving: true });
    expect(result.canSave).toBe(false);
    expect(result.status).toEqual({ kind: "saving" });
  });

  it("shows the server's error over everything but saving", () => {
    const error = "Your note is too long.";
    expect(draft({ draft: "Hello", error }).status).toEqual({
      kind: "error",
      message: error,
    });
    expect(draft({ draft: "Hello", error, isSaving: true }).status).toEqual({
      kind: "saving",
    });
  });
});

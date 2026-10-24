import { z } from "zod";

/**
 * Document pushed by the NiceMatrix backend for a NiceNote share (contract niceideas-share.md §6).
 * Rich text arrives already parsed (lines + runs): it is rendered structurally, never as markdown.
 * No count / length limits (the request body cap of the source API bounds the size).
 * Stored with `origin: "nicenote"` so stored documents can be told apart from the API format.
 */
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

const run = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  strike: z.boolean().optional(),
  code: z.boolean().optional(),
  // Unsafe links are dropped (the text stays), never rendered.
  href: z.string().max(4000).optional().transform((h) => (h && SAFE_HREF.test(h.trim()) ? h.trim() : undefined)),
});

const line = z.object({
  kind: z.enum(["paragraph", "heading", "bullet", "ordered", "quote", "hr"]),
  level: z.number().int().min(1).max(6).optional(),
  indent: z.number().int().min(0).max(64).optional(),
  number: z.number().int().min(0).max(1_000_000_000).optional(),
  runs: z.array(run),
});

const ref = z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/);
const ready = { state: z.literal("ready"), ref, mime: z.string().max(100), bytes: z.number().int().min(0) };
const caption = z.string().max(2000).optional();

const imageReady = z.object({ type: z.literal("image"), ...ready, width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), caption, alt: caption });
const audioReady = z.object({
  type: z.literal("audio"),
  ...ready,
  durationMs: z.number().int().min(0).optional(),
  title: caption,
  markers: z.array(z.object({ timeMs: z.number().int().min(0), label: z.string().max(500).optional() })).optional(),
});
const pending = (type: "image" | "audio") => z.object({ type: z.literal(type), state: z.literal("pending") });

export const sourceBlock = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("rich"), lines: z.array(line) }),
  z.object({ type: z.literal("todo"), items: z.array(z.object({ checked: z.boolean(), runs: z.array(run) })) }),
  imageReady,
  audioReady,
  pending("image"),
  pending("audio"),
]);

export const sourceDocumentSchema = z.object({
  version: z.literal(1),
  title: z.string().max(2000).optional(),
  blocks: z.array(sourceBlock),
});

/** As stored in post_revision.document. */
export const storedSourceDocumentSchema = sourceDocumentSchema.extend({ origin: z.literal("nicenote") });

export type SourceRun = z.infer<typeof run>;
export type SourceLine = z.infer<typeof line>;
export type SourceBlock = z.infer<typeof sourceBlock>;
export type SourceDocument = z.infer<typeof storedSourceDocumentSchema>;
export type SourceMediaBlock = z.infer<typeof imageReady> | z.infer<typeof audioReady>;

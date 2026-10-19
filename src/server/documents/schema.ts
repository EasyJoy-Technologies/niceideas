import { z } from "zod";

/** Structural limits of a normalized document (design §3). */
export const DOC_LIMITS = {
  blocks: 300,
  totalChars: 100_000,
  images: 50,
  audios: 10,
  titleChars: 200,
  todoItems: 500,
  captionChars: 500,
  markers: 200,
} as const;

const uuid = z.uuid();
const text = (max: number) => z.string().max(max);

export const textBlock = z.object({
  type: z.literal("text"),
  format: z.enum(["plain", "markdown"]).default("plain"),
  text: z.string(),
});

export const todoBlock = z.object({
  type: z.literal("todo"),
  items: z.array(z.object({ text: text(2_000), checked: z.boolean().default(false) })).min(1).max(DOC_LIMITS.todoItems),
});

export const imageBlock = z.object({
  type: z.literal("image"),
  mediaId: uuid,
  alt: text(DOC_LIMITS.captionChars).optional(),
  caption: text(DOC_LIMITS.captionChars).optional(),
});

export const audioBlock = z.object({
  type: z.literal("audio"),
  mediaId: uuid,
  title: text(DOC_LIMITS.titleChars).optional(),
  markers: z
    .array(z.object({ timeMs: z.number().int().min(0), label: text(DOC_LIMITS.titleChars).optional() }))
    .max(DOC_LIMITS.markers)
    .optional(),
});

export const block = z.discriminatedUnion("type", [textBlock, todoBlock, imageBlock, audioBlock]);

export const documentSchema = z.object({
  version: z.literal(1),
  title: text(DOC_LIMITS.titleChars).optional(),
  blocks: z.array(block).min(1).max(DOC_LIMITS.blocks),
});

export type DocBlock = z.infer<typeof block>;
export type PostDocument = z.infer<typeof documentSchema>;

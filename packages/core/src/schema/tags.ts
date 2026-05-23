import { z } from "zod";

export const tagSchema = z.object({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "color must be #RRGGBB"),
  description: z.string().nullable(),
});

export const tagsFileSchema = z.object({
  version: z.literal(1),
  tags: z.record(z.string(), tagSchema),
});

export type Tag = z.infer<typeof tagSchema>;
export type TagsFile = z.infer<typeof tagsFileSchema>;

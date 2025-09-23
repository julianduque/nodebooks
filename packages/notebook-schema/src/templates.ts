import { z } from "zod";

export const TemplateBadgeToneSchema = z.enum([
  "slate",
  "emerald",
  "sky",
  "purple",
  "amber",
]);
export type TemplateBadgeTone = z.infer<typeof TemplateBadgeToneSchema>;

export const NotebookTemplateBadgeSchema = z.object({
  text: z.string().default("Template"),
  tone: TemplateBadgeToneSchema.default("slate"),
});
export type NotebookTemplateBadge = z.infer<typeof NotebookTemplateBadgeSchema>;

export const NotebookTemplateSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  badge: NotebookTemplateBadgeSchema.default({
    text: "Template",
    tone: "slate",
  }),
  tags: z.array(z.string()).default([]),
  order: z.number().int().nonnegative().default(100),
});
export type NotebookTemplateSummary = z.infer<
  typeof NotebookTemplateSummarySchema
>;

export type NotebookTemplateId = NotebookTemplateSummary["id"];

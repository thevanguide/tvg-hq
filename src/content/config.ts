import { defineCollection, z } from "astro:content";

const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  author: z.string().default("The Van Guide"),
  category: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  ogImage: z.string().optional(),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
});

const insurance = defineCollection({
  type: "content",
  schema: articleSchema,
});

const registration = defineCollection({
  type: "content",
  schema: articleSchema.extend({
    state: z.string().optional(),
  }),
});

const blog = defineCollection({
  type: "content",
  schema: articleSchema,
});

export const collections = { insurance, registration, blog };

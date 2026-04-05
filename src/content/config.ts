import { defineCollection, z } from "astro:content";

const referenceSchema = z.object({
  title: z.string(),
  description: z.string(),
  lastUpdated: z.coerce.date(),
  author: z.string().default("The Van Guide"),
  category: z.string().optional(),
  cluster: z.string().optional(),
  pillar: z.boolean().default(false),
  order: z.number().optional(),
  keywords: z.array(z.string()).default([]),
  ogImage: z.string().optional(),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
});

const insurance = defineCollection({
  type: "content",
  schema: referenceSchema,
});

const registration = defineCollection({
  type: "content",
  schema: referenceSchema.extend({
    state: z.string().optional(),
  }),
});

const certification = defineCollection({
  type: "content",
  schema: referenceSchema,
});

const blog = defineCollection({
  type: "content",
  schema: referenceSchema,
});

export const collections = { insurance, registration, certification, blog };

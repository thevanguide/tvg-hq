import { defineCollection, z } from "astro:content";

const referenceSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishedDate: z.coerce.date().optional(),
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
  // Programmatic SEO fields — additive, all optional.
  // Used by future template-driven pages (state landing pages, carrier profiles, etc.)
  stateCode: z.string().optional(),
  carrierSlug: z.string().optional(),
  topicCluster: z.string().optional(),
  targetKeyword: z.string().optional(),
  pageType: z.enum(["hub", "spoke", "programmatic"]).optional(),
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

/**
 * Programmatic SEO template registry (stub).
 *
 * Future home of template-driven page generators for state landing pages,
 * carrier profiles, state-by-carrier crosses, etc. A follow-up session will
 * wire these to `src/content/` and the Supabase builders table.
 *
 * Template specs live in: Research/Content_Templates_Apr2026.md
 * Keyword targets live in: Research/Keyword_Clusters_MegaMenu_Apr2026.md
 */

export type TemplateId =
  | "state-registration"
  | "state-insurance"
  | "state-builders"
  | "carrier-profile"
  | "platform-insurance"
  | "howto-guide";

export interface TemplateSpec {
  id: TemplateId;
  routePattern: string;
  pageType: "hub" | "spoke" | "programmatic";
  jsonLdType: "Article" | "FAQPage" | "HowTo" | "ItemList";
  minWords: number;
}

export const templates: Record<TemplateId, TemplateSpec> = {
  "state-registration": {
    id: "state-registration",
    routePattern: "/registration/[state]/",
    pageType: "programmatic",
    jsonLdType: "Article",
    minWords: 1200,
  },
  "state-insurance": {
    id: "state-insurance",
    routePattern: "/insurance/by-state/[state]/",
    pageType: "programmatic",
    jsonLdType: "Article",
    minWords: 1000,
  },
  "state-builders": {
    id: "state-builders",
    routePattern: "/builders/[state]/",
    pageType: "programmatic",
    jsonLdType: "ItemList",
    minWords: 600,
  },
  "carrier-profile": {
    id: "carrier-profile",
    routePattern: "/insurance/[carrier]/",
    pageType: "spoke",
    jsonLdType: "Article",
    minWords: 1400,
  },
  "platform-insurance": {
    id: "platform-insurance",
    routePattern: "/insurance/by-vehicle/[platform]/",
    pageType: "programmatic",
    jsonLdType: "Article",
    minWords: 1000,
  },
  "howto-guide": {
    id: "howto-guide",
    routePattern: "/guides/[topic]/",
    pageType: "spoke",
    jsonLdType: "HowTo",
    minWords: 1500,
  },
};

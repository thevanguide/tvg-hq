import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import rehypeExternalLinks from 'rehype-external-links';

export default defineConfig({
  site: 'https://thevanguide.com',
  markdown: {
    rehypePlugins: [
      [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
    ],
  },
  integrations: [
    mdx({
      rehypePlugins: [
        [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
      ],
    }),
    react(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        // Placeholder tool pages (not yet built)
        if (path.startsWith("/tools/van-insurance-finder")) return false;
        // Logged-in-only / admin pages — no indexing
        if (path.startsWith("/builders/admin/")) return false;
        if (path.startsWith("/builders/dashboard/")) return false;
        if (path.startsWith("/auth/callback/")) return false;
        return true;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  trailingSlash: 'always',
  output: 'static',
});

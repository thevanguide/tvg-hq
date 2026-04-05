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
      // Exclude URLs that are noindex, placeholder, or not meant for organic discovery yet.
      filter: (page) => {
        const path = new URL(page).pathname;
        // Seeded state index pages without real listings
        if (/^\/builders\/[^/]+\/$/.test(path)) return false;
        // Placeholder tool pages
        if (path.startsWith("/tools/van-insurance-finder")) return false;
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

import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

// `@nocturne/ui/theme.css` declares its @font-face sources under /fonts, which only
// the app package ships; a copy at build start keeps the showcase self-contained.
function sharedFonts(): Plugin {
  return {
    name: 'shared-fonts',
    buildStart() {
      const src = resolve(__dirname, '../app/static/fonts');
      if (!existsSync(src)) {
        this.warn(`shared-fonts: source not found at ${src}; skipping font copy`);
        return;
      }
      const dest = resolve(__dirname, 'static/fonts');
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [sharedFonts(), tailwindcss(), sveltekit()],
  server: {
    fs: {
      strict: false, // pnpm symlinks into its content-addressable store
    },
  },
  ssr: {
    noExternal: ['@nocturne/ui'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

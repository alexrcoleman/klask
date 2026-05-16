import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const buildCreatedAt = new Date().toISOString();

function devPrerenderShellPlugin(): Plugin {
  return {
    name: 'klask-dev-prerender-shell',
    enforce: 'post',
    async transformIndexHtml(html, context) {
      if (!context.server || !html.includes('<!--app-html-->')) {
        return html;
      }

      const { renderShell } = await context.server.ssrLoadModule('/src/entry-server.tsx');
      return html.replace('<!--app-html-->', renderShell());
    },
  };
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_KLASK_BUILD_TIME': JSON.stringify(buildCreatedAt),
  },
  plugins: [react(), devPrerenderShellPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      ignored: ['**/artifacts/**'],
    },
  },
});

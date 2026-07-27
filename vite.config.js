import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Vite plugin: removes all console.* calls from JS/JSX in production builds */
function dropConsole() {
  return {
    name: 'drop-console',
    apply: 'build',
    transform(code, id) {
      // Only strip from project source files, never from node_modules
      if (id.includes('node_modules')) return null;
      if (!/\.(jsx?|tsx?)$/.test(id)) return null;
      const stripped = code.replace(
        /\bconsole\.(log|error|warn|info|debug|trace|group|groupEnd|groupCollapsed|time|timeEnd|assert|count|countReset|dir|dirxml|table)\s*\([^)]*\)\s*;?/g,
        ''
      );
      return stripped !== code ? { code: stripped, map: null } : null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropConsole()],
})




import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {cpSync,mkdirSync} from 'node:fs';
export default defineConfig(({mode})=>({
  plugins: [react(),...(mode==='desktop'?[{name:'desktop-local-design-assets',closeBundle(){mkdirSync('dist-desktop/assets/figma',{recursive:true});cpSync('apps/web/public/assets/figma','dist-desktop/assets/figma',{recursive:true});}}]:[])],
  root: 'apps/web',
  publicDir: mode==='desktop'?false:'public',
  build: { outDir: mode==='desktop'?'../../dist-desktop':'../../dist', emptyOutDir: true },
  server: {
    proxy: { '/api': 'http://127.0.0.1:4100', '/downloads/installers': 'http://127.0.0.1:4100', '/socket.io': { target: 'http://127.0.0.1:4100', ws: true } },
  },
}));

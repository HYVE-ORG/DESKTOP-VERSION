// Run before importing/deploying WEB-VERSION; Vercel reads config before building.
import {writeFileSync, existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function vercelConfig(apiOrigin) {
  const api = new URL(apiOrigin);
  if (api.protocol !== 'https:' || api.username || api.password || api.pathname !== '/' || api.search || api.hash || /^(localhost|127\.|\[::1\])/.test(api.hostname)) {
    throw new Error('Use only the public HTTPS API origin, without credentials, path or query.');
  }
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json', framework: 'vite',
    installCommand: 'ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci',
    buildCommand: 'npm run typecheck && npm run build:web', outputDirectory: 'dist',
    rewrites: ['/api', '/socket.io', '/downloads/installers'].map(prefix => ({source: `${prefix}/:path*`, destination: `${api.origin}${prefix}/:path*`})),
    headers: ['/api/:path*', '/socket.io/:path*'].map(source => ({source, headers: [
      {key: 'Cache-Control', value: 'private, no-store'},
      {key: 'x-vercel-enable-rewrite-caching', value: '0'},
    ]})),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.argv[2];
  if (!origin) throw new Error('Usage: node scripts/configure-vercel.mjs https://YOUR-API-HOST');
  if (existsSync('vercel.json') && !process.argv.includes('--replace')) throw new Error('vercel.json exists; review it or use --replace explicitly.');
  writeFileSync('vercel.json', JSON.stringify(vercelConfig(origin), null, 2) + '\n');
  console.log('Created vercel.json. Review, commit, then deploy. Socket.IO and cookies still require remote end-to-end validation.');
}

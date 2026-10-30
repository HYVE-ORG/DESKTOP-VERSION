import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error deployment helper is a native JS script
import {vercelConfig} from '../scripts/configure-vercel.mjs';
test('Vercel proxy preserves API prefixes and disables private response caching', () => {
  const config = vercelConfig('https://api.example.com');
  assert.equal(config.outputDirectory, 'dist');
  assert.deepEqual(config.rewrites[0], {source:'/api/:path*',destination:'https://api.example.com/api/:path*'});
  assert.equal(config.rewrites.length, 3);
  assert.equal(config.headers[0].headers[0].value, 'private, no-store');
});
test('Vercel config rejects credentials, paths, loopback and non-HTTPS origins', () => {
  for (const value of ['http://api.example.com', 'https://user:password@example.com', 'https://api.example.com/api', 'https://api.example.com?key=x', 'https://localhost', 'https://127.0.0.1']) {
    assert.throws(() => vercelConfig(value));
  }
});

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the application window fills the viewport without an outer frame', () => {
  const styles = readFileSync(new URL('../apps/web/src/styles.css', import.meta.url), 'utf8');
  const shell = styles.match(/\.app-window\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.match(shell, /margin:\s*0;/);
  assert.match(shell, /height:\s*100vh;/);
  assert.match(shell, /border:\s*0;/);
  assert.match(shell, /border-radius:\s*0;/);
  assert.match(shell, /box-shadow:\s*none;/);
});

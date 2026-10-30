import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set(['node_modules', '.output', '.git', '.wxt']);

function files(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(tsx|css)$/.test(name)) out.push(path);
  }
}

describe('spacing', () => {
  test('styles use the 4px scale instead of mt-N utilities', () => {
    const found: string[] = [];
    files('.', found);
    const hits = found.filter((path) => /mt-\d/.test(readFileSync(path, 'utf8')));
    expect(hits).toEqual([]);
  });
});

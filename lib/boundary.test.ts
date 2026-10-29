import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** bun test is run from the package root. */
const ROOT = process.cwd();

/** Imports of the functions that perform a provider HTTP call. */
const CLIENT_IMPORT =
  /import\s*\{[^}]*\b(callSystemOne|testCredentials|testFilter)\b[^}]*\}\s*from\s*['"][^'"]*provider['"]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

function rel(path: string): string {
  return path.slice(ROOT.length + 1);
}

describe('classification boundary', () => {
  test('the Jev key lives in extension local storage', () => {
    const settings = readFileSync(join(ROOT, 'lib/settings.ts'), 'utf8');
    const defaults = readFileSync(join(ROOT, 'lib/defaults.ts'), 'utf8');
    expect(settings).toContain("storage.defineItem<Settings>('local:settings'");
    expect(defaults).toContain('typesafeApiKey:');
    expect(defaults).toContain('openrouterApiKey:');
    expect(defaults).toMatch(/provider === 'openrouter' \? s\.openrouterApiKey : s\.typesafeApiKey/);
  });

  test('only the background worker imports the provider client', () => {
    const importers = walk(join(ROOT, 'entrypoints'))
      .filter((path) => CLIENT_IMPORT.test(readFileSync(path, 'utf8')))
      .map(rel);
    expect(importers).toEqual(['entrypoints/background.ts']);
  });

  test('provider hostnames stay in the HTTP client', () => {
    const files = [...walk(join(ROOT, 'entrypoints')), ...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'scripts'))];
    const callers = files
      .filter((path) => {
        const src = readFileSync(path, 'utf8');
        return src.includes('api.typesafe.ai') || src.includes('openrouter.ai/api');
      })
      .map(rel)
      .sort();
    expect(callers).toEqual(['lib/provider.ts']);

    const callSites = files
      .filter((path) => readFileSync(path, 'utf8').includes('callSystemOne('))
      .map(rel)
      .sort();
    expect(callSites).toEqual(['lib/classifier.ts', 'lib/provider.ts', 'scripts/eval.ts']);
  });

  test('a classification error leaves the post visible', () => {
    const classifier = readFileSync(join(ROOT, 'lib/classifier.ts'), 'utf8');
    expect(classifier).toMatch(/\.catch\(\(err\): Verdict => \(\{[\s\S]*?filtered: false/);

    const content = readFileSync(join(ROOT, 'entrypoints/content/index.ts'), 'utf8');
    expect(content).toContain('Failing open');
    expect(content).toMatch(/if \(!verdict \|\| verdict\.error\) \{[\s\S]*?unmaskById\(tweet\.id\)/);
  });
});

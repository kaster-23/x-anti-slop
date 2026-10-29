import { describe, expect, test } from 'bun:test';
import {
  contentErrorText,
  isContextInvalidatedError,
  reportContentFailure,
  runContentTask,
  runtimeAlive,
} from './extension-context';

describe('invalidated extension context', () => {
  test('a missing runtime id is not alive and does not throw', () => {
    expect(runtimeAlive(() => undefined)).toBe(false);
    expect(runtimeAlive(() => ({ id: undefined }))).toBe(false);
    expect(runtimeAlive(() => ({ id: '' }))).toBe(false);
    expect(runtimeAlive(() => ({ id: 'abc' }))).toBe(true);
    expect(
      runtimeAlive(() => {
        throw new Error('Extension context invalidated.');
      }),
    ).toBe(false);
  });

  test('storage throwing Extension context invalidated does not throw or log', async () => {
    const logs: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      let called = false;
      await runContentTask(
        runtimeAlive(() => undefined),
        async () => {
          called = true;
          throw new Error('Extension context invalidated.');
        },
        'could not save flagged accounts',
      );
      expect(called).toBe(false);

      await runContentTask(
        true,
        async () => {
          throw new Error('Extension context invalidated.');
        },
        'could not save flagged accounts',
      );
      reportContentFailure(
        'could not save flagged accounts',
        new Error('Extension context invalidated.'),
        true,
      );
      expect(logs).toEqual([]);
      expect(isContextInvalidatedError(new Error('Extension context invalidated.'))).toBe(true);
    } finally {
      console.warn = original;
    }
  });

  test('a real failure is still logged, with the key removed', () => {
    const logs: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      reportContentFailure('settings load failed', new Error('rejected apikey_secret'), true);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.[0]).toBe('[x-anti-slop] settings load failed');
      expect(logs[0]?.[1]).toBe(contentErrorText(new Error('rejected apikey_secret')));
      expect(String(logs[0]?.[1])).not.toContain('apikey_secret');
      expect(String(logs[0]?.[1])).toContain('[redacted]');
    } finally {
      console.warn = original;
    }
  });
});

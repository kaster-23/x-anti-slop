import { describe, expect, test } from 'bun:test';
import { redactSecrets } from './redact';

describe('redactSecrets', () => {
  test('leaves ordinary errors alone', () => {
    const message = 'Invalid API key — check it in the extension settings.';
    expect(redactSecrets(message)).toBe(message);
  });

  test('strips both provider key shapes', () => {
    expect(redactSecrets('rejected apikey_live_abc.def')).toBe('rejected [redacted]');
    expect(redactSecrets('bearer sk-or-v1-xyz')).toBe('bearer [redacted]');
  });
});

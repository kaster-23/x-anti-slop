import { describe, expect, test } from 'bun:test';
import { REQUEST_TIMEOUT_MS, nextRetryDelay } from './provider';

describe('request timeout and backoff', () => {
  test('each attempt gives up after about two seconds', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(2_000);
  });

  test('429 and 5xx back off exponentially, then fail open', () => {
    expect(nextRetryDelay(429, null, 0)).toBe(400);
    expect(nextRetryDelay(500, null, 1)).toBe(800);
    expect(nextRetryDelay(503, null, 2)).toBe(1_600);
    expect(nextRetryDelay(429, null, 3)).toBeNull();
  });

  test('429 and 529 wait out retry-after instead of the exponential delay', () => {
    expect(nextRetryDelay(429, '1', 0)).toBe(1_000);
    expect(nextRetryDelay(529, '2', 0)).toBe(2_000);
    expect(nextRetryDelay(429, '120', 0)).toBe(120_000);
  });

  test('a bad key and a rejected request are not retried', () => {
    expect(nextRetryDelay(401, null, 0)).toBeNull();
    expect(nextRetryDelay(422, '1', 0)).toBeNull();
  });
});

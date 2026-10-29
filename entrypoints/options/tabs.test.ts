import { describe, expect, test } from 'bun:test';
import { initialTab, tabFromHash, tabFromKey } from './tabs';

describe('options tab hash', () => {
  test('reads the four tab hashes and the older section anchors', () => {
    expect(tabFromHash('#filtering')).toBe('filtering');
    expect(tabFromHash('#lists')).toBe('lists');
    expect(tabFromHash('#appearance')).toBe('appearance');
    expect(tabFromHash('#account')).toBe('account');
    expect(tabFromHash('#filters')).toBe('filtering');
    expect(tabFromHash('#key')).toBe('account');
    expect(tabFromHash('#provider')).toBe('account');
    expect(tabFromHash('#usage')).toBe('account');
  });

  test('ignores an empty or unknown hash', () => {
    expect(tabFromHash('')).toBeNull();
    expect(tabFromHash('#')).toBeNull();
    expect(tabFromHash('#nope')).toBeNull();
  });

  test('opens Filtering when a key is saved and Account when it is not', () => {
    expect(initialTab('', true)).toBe('filtering');
    expect(initialTab('', false)).toBe('account');
    expect(initialTab('#lists', false)).toBe('lists');
    expect(initialTab('#key', true)).toBe('account');
  });
});

describe('options tab keys', () => {
  test('arrows, Home, and End move between tabs and other keys do not', () => {
    expect(tabFromKey('filtering', 'ArrowRight')).toBe('lists');
    expect(tabFromKey('account', 'ArrowRight')).toBe('filtering');
    expect(tabFromKey('lists', 'ArrowLeft')).toBe('filtering');
    expect(tabFromKey('filtering', 'ArrowLeft')).toBe('account');
    expect(tabFromKey('appearance', 'Home')).toBe('filtering');
    expect(tabFromKey('filtering', 'End')).toBe('account');
    expect(tabFromKey('lists', 'Tab')).toBeNull();
    expect(tabFromKey('lists', 'Enter')).toBeNull();
  });
});

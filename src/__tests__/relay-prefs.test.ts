import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadRelayHostname, storeRelayHostname, buildRelayUrl } from '@/lib/relay-prefs';

const STORAGE_KEY = 'relay-hostname';

beforeAll(() => {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      get length() { return Object.keys(store).length; },
      key: (index: number) => Object.keys(store)[index] ?? null,
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: {},
    writable: true,
    configurable: true,
  });
});

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe('loadRelayHostname', () => {
  it('returns default when localStorage is empty', () => {
    expect(loadRelayHostname()).toBe('r.toolbox.study');
  });

  it('returns stored value when set', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, 'custom.example.com');
    expect(loadRelayHostname()).toBe('custom.example.com');
  });
});

describe('storeRelayHostname', () => {
  it('persists value to localStorage', () => {
    storeRelayHostname('test.example.com');
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('test.example.com');
  });

  it('then loadRelayHostname returns the stored value', () => {
    storeRelayHostname('myrelay.local');
    expect(loadRelayHostname()).toBe('myrelay.local');
  });
});

describe('buildRelayUrl', () => {
  it('produces wss://r.toolbox.study/ws for default hostname', () => {
    expect(buildRelayUrl('r.toolbox.study')).toBe('wss://r.toolbox.study/ws');
  });

  it('produces ws://localhost/ws for localhost', () => {
    expect(buildRelayUrl('localhost')).toBe('ws://localhost/ws');
  });

  it('produces ws://127.0.0.1/ws for 127.0.0.1', () => {
    expect(buildRelayUrl('127.0.0.1')).toBe('ws://127.0.0.1/ws');
  });

  it('produces wss:// for non-local hostnames', () => {
    expect(buildRelayUrl('relay.example.com')).toBe('wss://relay.example.com/ws');
  });
});

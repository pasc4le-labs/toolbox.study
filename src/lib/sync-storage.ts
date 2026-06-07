const SYNC_KEY = 'sync-mnemonic';
const LAST_SYNC_KEY = 'sync-last-synced';
const DEVICE_ID_KEY = 'sync-device-id';

export function storeSyncKey(mnemonic: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_KEY, mnemonic);
}

export function loadSyncKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SYNC_KEY);
}

export function deleteSyncKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SYNC_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
}

export function storeLastSyncedAt(timestamp: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_SYNC_KEY, String(timestamp));
}

export function loadLastSyncedAt(): number | null {
  if (typeof window === 'undefined') return null;
  const val = localStorage.getItem(LAST_SYNC_KEY);
  return val ? parseInt(val, 10) : null;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

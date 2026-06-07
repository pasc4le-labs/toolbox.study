const SYNC_KEY = 'sync-mnemonic';
const LAST_SYNC_KEY = 'sync-last-synced';
const DEVICE_ID_KEY = 'sync-device-id';

export function storeSyncKey(mnemonic: string): void {
  localStorage.setItem(SYNC_KEY, mnemonic);
}

export function loadSyncKey(): string | null {
  return localStorage.getItem(SYNC_KEY);
}

export function deleteSyncKey(): void {
  localStorage.removeItem(SYNC_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
}

export function storeLastSyncedAt(timestamp: number): void {
  localStorage.setItem(LAST_SYNC_KEY, String(timestamp));
}

export function loadLastSyncedAt(): number | null {
  const val = localStorage.getItem(LAST_SYNC_KEY);
  return val ? parseInt(val, 10) : null;
}

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
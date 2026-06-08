const RELAY_HOSTNAME_KEY = 'relay-hostname';
const DEFAULT_RELAY_HOSTNAME = 'r.toolbox.study';

export function loadRelayHostname(): string {
  if (typeof window === 'undefined') return DEFAULT_RELAY_HOSTNAME;
  return localStorage.getItem(RELAY_HOSTNAME_KEY) || DEFAULT_RELAY_HOSTNAME;
}

export function storeRelayHostname(hostname: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RELAY_HOSTNAME_KEY, hostname);
}

export function buildRelayUrl(hostname: string): string {
  const protocol = hostname === 'localhost' || hostname === '127.0.0.1' ? 'ws' : 'wss';
  return `${protocol}://${hostname}/ws`;
}

import { generateMnemonic, validateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export { wordlist };

export function generateSyncKey(): string {
  return generateMnemonic(wordlist, 128);
}

export function validateSyncKey(mnemonic: string): boolean {
  const trimmed = mnemonic.trim().toLowerCase();
  if (trimmed.split(/\s+/).length !== 12) return false;
  return validateMnemonic(trimmed, wordlist);
}

export async function mnemonicToRoomId(mnemonic: string): Promise<string> {
  const trimmed = mnemonic.trim().toLowerCase();
  const entropy = mnemonicToEntropy(trimmed, wordlist);
  const hash = await crypto.subtle.digest('SHA-256', entropy);
  const hashArray = new Uint8Array(hash);
  return Array.from(hashArray.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
}

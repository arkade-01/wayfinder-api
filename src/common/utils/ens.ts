import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.drpc.org'),
});

export const ENS_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.eth$/;

export function isEnsName(value: string): boolean {
  return ENS_REGEX.test(value.trim());
}

export function isEthAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/**
 * Resolves an ENS name to an EVM address.
 * Returns null if the name does not resolve.
 */
export async function resolveEns(name: string): Promise<string | null> {
  try {
    const address = await client.getEnsAddress({ name: name.toLowerCase().trim() });
    return address ?? null;
  } catch {
    return null;
  }
}

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), quiet: true });

export const CHAIN_ID = 16602;
export const EXPLORER = "https://chainscan-galileo.0g.ai";

export function rpcUrl(): string {
  return process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";
}

export function indexerUrl(): string {
  return process.env.INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; configure the .env file`);
  return value;
}

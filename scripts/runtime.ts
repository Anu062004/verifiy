import { config } from "dotenv";
import { resolve } from "node:path";
import { ethers } from "ethers";

export const ROOT = resolve(__dirname, "..");
// Precedence: process environment > root .env > component .env.
config({ path: resolve(ROOT, ".env"), quiet: true });
export function loadComponentEnv(component: string): void {
  config({ path: resolve(ROOT, component, ".env"), quiet: true });
}
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
  if (!value) throw new Error(`Missing ${name}; configure the root .env file`);
  return value;
}
export function hash32(value: string, name = "hash"): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0{64}$/.test(value)) {
    throw new Error(`${name} must be a nonzero 0x-prefixed bytes32`);
  }
  return value.toLowerCase();
}
export function provider(): ethers.JsonRpcProvider {
  const request = new ethers.FetchRequest(rpcUrl());
  request.timeout = 20_000;
  return new ethers.JsonRpcProvider(request);
}
export async function requireGalileo(rpc: ethers.Provider): Promise<void> {
  const network = await rpc.getNetwork();
  if (network.chainId !== BigInt(CHAIN_ID)) {
    throw new Error(`Refusing chain ${network.chainId}; expected Galileo ${CHAIN_ID}`);
  }
}
export function wallet(rpc: ethers.Provider): ethers.Wallet {
  const key = requireEnv("PRIVATE_KEY");
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(key)) throw new Error("PRIVATE_KEY must be a 32-byte testnet key");
  return new ethers.Wallet(key, rpc);
}
export const ABI = [
  "function nextId() view returns (uint256)",
  "function submitRecord(bytes32 storageRootHash,bytes32 photoCommitment,bytes32 matchedUrlCommitment) returns (uint256)",
  "function getRecord(uint256 id) view returns (tuple(bytes32 storageRootHash,bytes32 photoCommitment,bytes32 matchedUrlCommitment,address submitter,uint64 timestamp))",
  "event RecordCreated(uint256 indexed id,bytes32 indexed storageRootHash,bytes32 photoCommitment,bytes32 matchedUrlCommitment,address indexed submitter,uint64 timestamp)",
];
export async function registry(rpc: ethers.JsonRpcProvider, write = false): Promise<ethers.Contract> {
  await requireGalileo(rpc);
  const address = ethers.getAddress(requireEnv("CONTRACT_ADDRESS"));
  if (await rpc.getCode(address) === "0x") throw new Error("CONTRACT_ADDRESS has no deployed code on Galileo");
  return new ethers.Contract(address, ABI, write ? wallet(rpc) : rpc);
}
export function recordId(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Record ID must be a nonnegative integer");
  return BigInt(value);
}
export function recordJson(record: ethers.Result) {
  return {
    storageRootHash: record.storageRootHash,
    photoCommitment: record.photoCommitment,
    matchedUrlCommitment: record.matchedUrlCommitment,
    submitter: record.submitter,
    timestamp: record.timestamp.toString(),
  };
}
export function createdRecordId(contract: ethers.Contract, receipt: ethers.TransactionReceipt): string {
  if (receipt.status !== 1) throw new Error(`Transaction did not succeed: ${receipt.hash}`);
  const events = receipt.logs.filter(log => log.address.toLowerCase() === String(contract.target).toLowerCase())
    .flatMap(log => {
      try { const event = contract.interface.parseLog(log); return event?.name === "RecordCreated" ? [event] : []; }
      catch { return []; }
    });
  if (events.length !== 1) throw new Error(`Expected one RecordCreated event in ${receipt.hash}`);
  return events[0].args.id.toString();
}
export function safeError(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string };
  let message = e?.shortMessage || e?.message || String(error);
  // Provider errors can contain request headers/transaction payloads. Keep CLI errors concise.
  for (const name of ["PRIVATE_KEY", "GOOGLE_APPLICATION_CREDENTIALS"]) {
    const secret = process.env[name];
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.slice(0, 1200);
}
export function cli(main: () => Promise<unknown>): void {
  // SDK progress belongs on stderr; stdout contains exactly one machine-readable result.
  console.log = (...args: unknown[]) => console.error(...args);
  main().then((result) => {
    process.stdout.write(JSON.stringify(result) + "\n", () => process.exit(0));
  }).catch((error) => {
    process.stderr.write(`ERROR: ${safeError(error)}\n`);
    process.exit(1);
  });
}

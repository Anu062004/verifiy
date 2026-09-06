import { Indexer, ZgFile } from "@0gfoundation/0g-storage-ts-sdk";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cli, hash32, indexerUrl, loadComponentEnv, provider, requireGalileo, rpcUrl, wallet } from "../../scripts/runtime";

loadComponentEnv("storage-service");
const MAX_RECORD_BYTES = 1024 * 1024;

export async function fileRoot(path: string): Promise<string> {
  const file = await ZgFile.fromFilePath(path);
  try {
    const [tree, error] = await file.merkleTree();
    if (error || !tree) throw error || new Error("0G Merkle tree was not generated");
    return hash32(tree.rootHash()!, "Merkle root");
  } finally {
    await file.close();
  }
}

export function uploadResult(tx: { rootHash: string; txHash: string } | { rootHashes: string[]; txHashes: string[] }, computedRoot: string) {
  if (!("rootHash" in tx) && (tx.rootHashes.length !== 1 || tx.txHashes.length !== 1)) {
    throw new Error("Unexpected fragmented upload for a small verification record; refusing to discard roots");
  }
  const rootHash = hash32("rootHash" in tx ? tx.rootHash : tx.rootHashes[0], "uploaded root");
  const txHash = hash32("txHash" in tx ? tx.txHash : tx.txHashes[0], "upload transaction");
  if (rootHash !== computedRoot.toLowerCase()) throw new Error("Uploaded root does not match the local record Merkle root");
  return { rootHash, txHash };
}

export async function uploadFile(path: string) {
  const filePath = resolve(path);
  const size = statSync(filePath).size;
  if (size === 0 || size > MAX_RECORD_BYTES) throw new Error("Verification record must be 1 byte–1 MiB");
  const record = JSON.parse(readFileSync(filePath, "utf8"));
  if (record.schema_version !== "1.0" || record.human_confirmation?.confirmed !== true || record.human_confirmation?.subject_consent_attested !== true) {
    throw new Error("Upload requires a version 1.0 record with human confirmation and subject consent");
  }
  const rpc = provider();
  await requireGalileo(rpc);
  const signer = wallet(rpc);
  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, treeError] = await file.merkleTree();
    if (treeError || !tree) throw treeError || new Error("No Merkle tree");
    const computedRoot = hash32(tree.rootHash()!);
    console.error(`Computed storage root: ${computedRoot}`);
    const indexer = new Indexer(indexerUrl());
    const [tx, uploadError] = await indexer.upload(file, rpcUrl(), signer, { finalityRequired: true });
    if (uploadError) throw uploadError;
    return { ...uploadResult(tx, computedRoot), indexerRpc: indexerUrl() };
  } finally {
    await file.close();
    rpc.destroy();
  }
}

export async function downloadFile(root: string, destination: string) {
  const rootHash = hash32(root, "storage root");
  const path = resolve(destination);
  if (existsSync(path)) throw new Error("Download destination exists; choose a fresh path to preserve evidence");
  mkdirSync(dirname(path), { recursive: true });
  const directory = mkdtempSync(join(dirname(path), ".download-"));
  const temporary = join(directory, "record.json");
  try {
    const error = await new Indexer(indexerUrl()).download(rootHash, temporary, true);
    if (error) throw error;
    if (statSync(temporary).size > MAX_RECORD_BYTES) throw new Error("Downloaded verification record exceeds 1 MiB");
    if (await fileRoot(temporary) !== rootHash) throw new Error("Downloaded record Merkle root mismatch");
    renameSync(temporary, path);
    return { rootHash, outputPath: path, proofVerified: true };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  cli(async () => {
    const [command, first, second] = process.argv.slice(2);
    if (command === "upload" && first && !second) return uploadFile(first);
    if (command === "download" && first && second) return downloadFile(first, second);
    if (command === "root" && first && !second) return { rootHash: await fileRoot(first) };
    throw new Error("Usage: storage.ts upload <record.json> | download <rootHash> <new-output.json> | root <file>");
  });
}

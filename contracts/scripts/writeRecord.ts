import { existsSync, writeFileSync } from "node:fs";
import { CHAIN_ID, EXPLORER, cli, createdRecordId, hash32, loadComponentEnv, provider, recordJson, registry } from "../../scripts/runtime";

loadComponentEnv("contracts");
cli(async () => {
  const [root, photo, url, journal] = process.argv.slice(2);
  if (!root || !photo || !url) throw new Error("Usage: writeRecord.ts <storageRootHash> <photoCommitment> <matchedUrlCommitment> [journal.json]");
  const hashes = [hash32(root, "storage root"), hash32(photo, "photo commitment"), hash32(url, "URL commitment")];
  if (journal && existsSync(journal)) throw new Error("Transaction journal already exists; inspect it before submitting again");
  const rpc = provider();
  const contract = await registry(rpc, true);
  const tx = await contract.submitRecord(...hashes);
  const pending = { txHash: tx.hash, chainId: CHAIN_ID, contractAddress: await contract.getAddress(), status: "broadcast" };
  if (journal) writeFileSync(journal, JSON.stringify(pending, null, 2), { flag: "wx" });
  console.error(`Chain transaction broadcast: ${tx.hash}`);
  const receipt = await tx.wait(1, 180_000);
  if (!receipt || receipt.status !== 1) throw new Error(`Transaction did not succeed: ${tx.hash}; inspect before retrying`);
  const id = createdRecordId(contract, receipt);
  const record = recordJson(await contract.getRecord(id));
  if ([record.storageRootHash, record.photoCommitment, record.matchedUrlCommitment].some((value, i) => value.toLowerCase() !== hashes[i])) {
    throw new Error(`Read-back commitments disagree with transaction ${tx.hash}`);
  }
  const result = { ...pending, status: "mined", recordId: id, blockNumber: receipt.blockNumber, explorerUrl: `${EXPLORER}/tx/${tx.hash}`, record };
  if (journal) writeFileSync(journal, JSON.stringify(result, null, 2));
  rpc.destroy();
  return result;
});

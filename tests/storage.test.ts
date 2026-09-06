import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileRoot, uploadResult } from "../storage-service/src/storage";
import { hash32, requireGalileo } from "../scripts/runtime";
import { ethers } from "ethers";

test("real 0G SDK Merkle roots are stable and change when record bytes change", async () => {
  const directory = mkdtempSync(join(tmpdir(), "face-chain-sdk-test-"));
  try {
    const path = join(directory, "record.json");
    const payload = Buffer.from(JSON.stringify({ synthetic_test_nonce: randomBytes(16).toString("hex") }));
    writeFileSync(path, payload);
    const root = await fileRoot(path);
    assert.equal(root, await fileRoot(path));
    assert.match(root, /^0x[0-9a-f]{64}$/);
    writeFileSync(path, Buffer.concat([payload, Buffer.from("\n")]));
    assert.notEqual(await fileRoot(path), root);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("upload parsing preserves the entire commitment and rejects fragments or mismatched roots", () => {
  const rootHash = ethers.hexlify(randomBytes(32));
  const txHash = ethers.hexlify(randomBytes(32));
  assert.deepEqual(uploadResult({ rootHash, txHash }, rootHash), { rootHash, txHash });
  assert.deepEqual(uploadResult({ rootHashes: [rootHash], txHashes: [txHash] }, rootHash), { rootHash, txHash });
  assert.throws(() => uploadResult({ rootHashes: [rootHash, txHash], txHashes: [txHash] }, rootHash), /fragmented/);
  assert.throws(() => uploadResult({ rootHash, txHash }, txHash), /does not match/);
  assert.throws(() => hash32(ethers.ZeroHash), /nonzero/);
});

test("live adapters refuse a non-Galileo provider", async () => {
  const wrong = { getNetwork: async () => ({ chainId: 1n }) } as unknown as ethers.Provider;
  await assert.rejects(requireGalileo(wrong), /Refusing chain 1/);
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "mocha";
import { ethers } from "hardhat";
import { createdRecordId } from "../../scripts/runtime";

describe("VerificationRegistry", () => {
  it("appends immutable commitments, emits the correct ID, and reads every field back", async () => {
    const [owner, other] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("VerificationRegistry")).deploy();
    await registry.waitForDeployment();
    const hashes = Array.from({ length: 3 }, () => ethers.hexlify(randomBytes(32)));
    const receipt = await (await registry.submitRecord(...hashes)).wait();
    assert.equal(await registry.nextId(), 1n);
    assert.equal(createdRecordId(registry, receipt!), "0");
    const event = registry.interface.parseLog(receipt!.logs[0]);
    assert.equal(event!.name, "RecordCreated");
    assert.equal(event!.args.id, 0n);
    const first = await registry.getRecord(0);
    assert.deepEqual([first.storageRootHash, first.photoCommitment, first.matchedUrlCommitment], hashes);
    assert.equal(first.submitter, owner.address);
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    assert.equal(first.timestamp, BigInt(block!.timestamp));
    assert.deepEqual(Array.from(event!.args).slice(1), Array.from(first));
    const second = registry.connect(other) as typeof registry;
    await (await second.submitRecord(...hashes)).wait();
    assert.equal(await registry.nextId(), 2n);
    assert.equal((await registry.getRecord(1)).submitter, other.address);
    assert.deepEqual(Array.from(await registry.getRecord(0)), Array.from(first));
  });

  it("rejects empty commitments and nonexistent IDs without advancing the counter", async () => {
    const registry = await (await ethers.getContractFactory("VerificationRegistry")).deploy();
    const digest = ethers.sha256(randomBytes(64));
    for (let position = 0; position < 3; position++) {
      const hashes = [digest, digest, digest];
      hashes[position] = ethers.ZeroHash;
      await assert.rejects(registry.submitRecord(...hashes), /empty/);
    }
    assert.equal(await registry.nextId(), 0n);
    await assert.rejects(registry.getRecord(0), /record does not exist/);
  });
});

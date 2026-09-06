import { ethers } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHAIN_ID, EXPLORER, ROOT, requireGalileo, safeError } from "../../scripts/runtime";

async function main() {
  await requireGalileo(ethers.provider);
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("Set PRIVATE_KEY to a funded Galileo testnet wallet in .env");
  if (await ethers.provider.getBalance(signer.address) === 0n) throw new Error("Fund the testnet wallet at https://faucet.0g.ai");
  const registry = await (await ethers.getContractFactory("VerificationRegistry")).deploy();
  const tx = registry.deploymentTransaction()!;
  console.log(`Deployment broadcast: ${tx.hash}`);
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const result = { chainId: CHAIN_ID, contractAddress: address, txHash: tx.hash, explorerUrl: `${EXPLORER}/tx/${tx.hash}` };
  mkdirSync(resolve(ROOT, "output"), { recursive: true });
  writeFileSync(resolve(ROOT, "output", `deployment-${address}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`Set CONTRACT_ADDRESS=${address} in your root .env`);
}
main().catch((error) => { console.error(safeError(error)); process.exitCode = 1; });

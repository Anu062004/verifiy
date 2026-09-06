import { CHAIN_ID, cli, indexerUrl, loadComponentEnv, provider, registry, requireGalileo, wallet } from "./runtime";
import { ethers } from "ethers";

loadComponentEnv("contracts");
loadComponentEnv("storage-service");
cli(async () => {
  const rpc = provider();
  await requireGalileo(rpc);
  const signer = wallet(rpc);
  const balance = await rpc.getBalance(signer.address);
  if (balance === 0n) throw new Error(`Fund testnet wallet ${signer.address} at https://faucet.0g.ai`);
  let contractAddress = null;
  if (!process.argv.includes("--for-deploy")) {
    const contract = await registry(rpc);
    await contract.nextId();
    contractAddress = await contract.getAddress();
  }
  const response = await fetch(indexerUrl(), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "indexer_getShardedNodes", params: [] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Storage indexer returned HTTP ${response.status}`);
  const body = await response.json() as { error?: { message: string }; result?: { trusted?: unknown[] } };
  if (body.error || !body.result?.trusted?.length) throw new Error(`No trusted storage nodes available: ${body.error?.message || "empty response"}`);
  rpc.destroy();
  return { ready: true, chainId: CHAIN_ID, walletAddress: signer.address, balance0G: ethers.formatEther(balance), contractAddress, storageNodes: body.result.trusted.length };
});

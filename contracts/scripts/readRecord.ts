import { CHAIN_ID, cli, createdRecordId, hash32, loadComponentEnv, provider, recordId, recordJson, registry } from "../../scripts/runtime";

loadComponentEnv("contracts");
cli(async () => {
  const args = process.argv.slice(2);
  const byTx = args[0] === "--tx";
  const [value, address] = byTx ? args.slice(1) : args;
  if (value === undefined) throw new Error("Usage: readRecord.ts <recordId> [contractAddress] | --tx <txHash> [contractAddress]");
  if (address) process.env.CONTRACT_ADDRESS = address;
  const rpc = provider();
  const contract = await registry(rpc);
  let id = value;
  if (byTx) {
    const receipt = await rpc.getTransactionReceipt(hash32(value, "transaction hash"));
    if (!receipt) throw new Error("Transaction is not mined or is unknown; inspect the explorer before retrying a write");
    id = createdRecordId(contract, receipt);
  }
  const result = { chainId: CHAIN_ID, contractAddress: await contract.getAddress(), recordId: recordId(id).toString(), ...recordJson(await contract.getRecord(recordId(id))) };
  rpc.destroy();
  return result;
});

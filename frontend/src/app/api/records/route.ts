import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    const rpcUrl = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";
    const contractAddress = process.env.CONTRACT_ADDRESS;

    if (!contractAddress) {
      return NextResponse.json({ error: "CONTRACT_ADDRESS not configured" }, { status: 500 });
    }

    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(rpcUrl);

    const contract = new Contract(
      contractAddress,
      [
        "function getRecord(uint256 id) view returns (tuple(bytes32 storageRootHash,bytes32 photoCommitment,bytes32 matchedUrlCommitment,address submitter,uint64 timestamp))",
        "function nextId() view returns (uint256)",
      ],
      provider
    );

    if (id) {
      const record = await contract.getRecord(BigInt(id));
      return NextResponse.json({
        id: Number(id),
        storageRootHash: record.storageRootHash,
        photoCommitment: record.photoCommitment,
        matchedUrlCommitment: record.matchedUrlCommitment,
        submitter: record.submitter,
        timestamp: record.timestamp,
      });
    }

    const nextId = await contract.nextId();
    const records = [];
    const batchSize = Math.min(Number(nextId), 50);

    for (let i = 0; i < batchSize; i++) {
      try {
        const record = await contract.getRecord(BigInt(i));
        records.push({
          id: i,
          storageRootHash: record.storageRootHash,
          photoCommitment: record.photoCommitment,
          matchedUrlCommitment: record.matchedUrlCommitment,
          submitter: record.submitter,
          timestamp: record.timestamp,
        });
      } catch {
        // Skip empty records
      }
    }

    return NextResponse.json({ records, total: Number(nextId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch records" },
      { status: 500 }
    );
  }
}

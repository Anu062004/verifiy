import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const txHash = searchParams.get("tx");

    if (!txHash) {
      return NextResponse.json({ error: "tx hash required" }, { status: 400 });
    }

    const rpcUrl = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";
    const { JsonRpcProvider } = await import("ethers");
    const provider = new JsonRpcProvider(rpcUrl);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const block = await provider.getBlock(receipt.blockNumber);

    return NextResponse.json({
      hash: receipt.hash,
      status: receipt.status === 1 ? "confirmed" : "failed",
      blockNumber: receipt.blockNumber,
      timestamp: block?.timestamp,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch transaction" },
      { status: 500 }
    );
  }
}

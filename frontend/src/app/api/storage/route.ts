import { NextResponse } from "next/server";

export async function GET() {
  try {
    const indexerUrl = process.env.INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";
    const response = await fetch(indexerUrl + "/health", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json({ status: "degraded", message: "Storage service partially available" }, { status: 200 });
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ status: "offline", message: "Storage service unavailable" }, { status: 200 });
  }
}

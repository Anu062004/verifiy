import { NextRequest, NextResponse } from "next/server";

const backend = () => process.env.BACKEND_URL || "http://127.0.0.1:8000";

async function relay(response: Response) {
  const data = await response.json().catch(() => ({ error: "Backend returned an invalid response" }));
  return NextResponse.json(data, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const path = params.get("history") === "true"
      ? "/api/history"
      : params.get("jobId")
        ? `/api/jobs/${encodeURIComponent(params.get("jobId")!)}`
        : "/api/health";
    return relay(await fetch(backend() + path, { cache: "no-store" }));
  } catch {
    return NextResponse.json(
      { error: "Local backend is offline. Start it with npm run backend:dev." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const response = await fetch(backend() + "/api/search", {
        method: "POST",
        body: await request.formData(),
      });
      return relay(response);
    }

    const body = await request.json();
    const jobId = typeof body.jobId === "string" ? encodeURIComponent(body.jobId) : "";
    if (!jobId || !["verify", "commit", "settle"].includes(body.action)) {
      return NextResponse.json({ error: "Invalid pipeline action" }, { status: 400 });
    }
    const { action, jobId: _jobId, ...payload } = body;
    void _jobId;
    const response = await fetch(`${backend()}/api/jobs/${jobId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return relay(response);
  } catch {
    return NextResponse.json(
      { error: "Local backend is offline. Start it with npm run backend:dev." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  try {
    const response = await fetch(`${backend()}/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
    if (response.status === 204) return new NextResponse(null, { status: 204 });
    return relay(response);
  } catch {
    return NextResponse.json({ error: "Local backend is offline" }, { status: 503 });
  }
}

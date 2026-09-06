"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, CircleAlert, Database, Fingerprint, LoaderCircle, RotateCcw, Search, ShieldCheck, Upload } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

type Face = { status: "verified" | "not_verified" | "unavailable"; verified: boolean | null; model: string; distance: number | null; threshold: number | null; reason?: string };
type Candidate = { index: number; page_url: string; page_title: string | null; reverse_match_type: string; is_social: boolean; face_verification?: Face };
type Run = {
  runId: string; status: string; photoCommitment?: string; candidates: Candidate[]; readbackVerified?: boolean; error?: string;
  storage?: { rootHash: string; txHash: string };
  chain?: { recordId: string; txHash: string; explorerUrl: string };
};
type Health = { status: string; searchReady: boolean; commitReady: boolean; checks: Record<string, boolean>; error?: string };

const statusText: Record<string, string> = {
  encoding_face: "Encoding face locally", searching_web: "Searching indexed pages", search_complete: "Candidates ready",
  face_checked: "Face evidence ready", committing: "Publishing proof", record_created: "Record prepared",
  storage_uploaded: "Stored on 0G", storage_verified: "Storage proof verified", chain_mined: "Chain transaction mined",
  complete: "Read-back verified", failed: "Run stopped",
};

async function json(response: Response) {
  const body = await response.json().catch(() => ({ error: "Invalid server response" }));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

const short = (value?: string) => value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "Pending";

export default function VerifyPage() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [consent, setConsent] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [operator, setOperator] = useState("demo_operator");
  const [reviewed, setReviewed] = useState(false);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState<"search" | "verify" | "commit" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/pipeline", { cache: "no-store" }).then(json).then(setHealth).catch((reason) =>
      setHealth({ status: "offline", searchReady: false, commitReady: false, checks: {}, error: reason.message }));
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = useCallback((chosen?: File) => {
    setError("");
    if (!chosen) return;
    if (!chosen.type.startsWith("image/")) return setError("Choose a JPEG, PNG, or WebP image.");
    if (chosen.size > 8 * 1024 * 1024) return setError("The image must be 8 MiB or smaller.");
    setFile(chosen); setPreview(URL.createObjectURL(chosen)); setRun(null); setSelected(null);
  }, []);

  const search = useCallback(async () => {
    if (!file || !consent) return;
    setBusy("search"); setError("");
    try {
      const form = new FormData(); form.append("photo", file); form.append("consent", "true");
      setRun(await json(await fetch("/api/pipeline", { method: "POST", body: form })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Search failed"); }
    finally { setBusy(null); }
  }, [consent, file]);

  const verify = useCallback(async (index: number) => {
    if (!run) return;
    setBusy("verify"); setError(""); setSelected(index); setReviewed(false); setApproved(false);
    try {
      const body = await json(await fetch("/api/pipeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", jobId: run.runId, candidateIndex: index }) }));
      setRun(body.run);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Face check failed"); }
    finally { setBusy(null); }
  }, [run]);

  const commit = useCallback(async () => {
    if (!run || selected === null) return;
    setBusy("commit"); setError("");
    try {
      setRun(await json(await fetch("/api/pipeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "commit", jobId: run.runId, candidateIndex: selected, operator, humanConfirmed: reviewed, publishConfirmed: approved }) })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Commit failed"); }
    finally { setBusy(null); }
  }, [approved, operator, reviewed, run, selected]);

  const reset = useCallback(async () => {
    if (run && run.status !== "complete") await fetch(`/api/pipeline?jobId=${encodeURIComponent(run.runId)}`, { method: "DELETE" }).catch(() => undefined);
    setFile(null); setPreview(""); setConsent(false); setRun(null); setSelected(null); setReviewed(false); setApproved(false); setError("");
    if (input.current) input.current.value = "";
  }, [run]);

  const choice = selected === null ? undefined : run?.candidates[selected];
  const face = choice?.face_verification;
  const eligible = Boolean(choice?.is_social && face && face.status !== "not_verified" && reviewed && approved && operator.trim());

  return (
    <div className="workbench-shell">
      <aside className="workbench-rail flex flex-col gap-7 p-5 lg:sticky lg:top-0 lg:h-screen">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-cobalt text-on-cobalt"><Fingerprint className="h-4 w-4" /></span>FaceChain</Link>
        <nav aria-label="Verification sections" className="mobile-scroll flex gap-2 text-sm lg:flex-col">
          <a href="#upload" className="rail-link bg-cobalt-soft text-cobalt"><Upload className="h-4 w-4" />Upload</a>
          <a href="#results" className="rail-link"><Search className="h-4 w-4" />Evidence</a>
          <a href="#proof" className="rail-link"><ShieldCheck className="h-4 w-4" />Proof</a>
          <Link href="/records" className="rail-link"><Database className="h-4 w-4" />Records</Link>
        </nav>
        <p className="mt-auto hidden border-t border-border pt-4 text-xs text-muted lg:block">Local operator session<br />Embeddings stay in memory.</p>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex min-w-0 items-center gap-3"><span className={`status-dot h-2 w-2 shrink-0 rounded-full ${health?.status === "online" ? "bg-success" : "bg-danger"}`} /><div className="min-w-0"><p className="truncate text-sm font-semibold">Local pipeline</p><p className="truncate font-mono text-[11px] text-muted">127.0.0.1:8000 · {health?.status || "checking"}</p></div></div>
          <div className="flex items-center gap-2">{run && <button onClick={reset} className="control"><RotateCcw className="h-4 w-4" />Reset</button>}<ThemeToggle /></div>
        </header>

        <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 sm:py-12">
          <div className="mb-8 max-w-3xl"><p className="eyebrow">Verification workbench</p><h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">Trace a consenting photo to public evidence.</h1><p className="mt-4 max-w-2xl text-base text-muted sm:text-lg">Run the real face encoder and Google Web Detection locally. You decide which returned page is correct before anything is published.</p></div>
          {error && <div role="alert" className="mb-6 flex items-start gap-3 border-l-4 border-danger bg-danger-soft px-4 py-3 text-sm text-danger"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

          <div className="workbench-stage">
            <div className="min-w-0 space-y-5">
              <section id="upload" className="panel shadow-[var(--shadow)]" aria-labelledby="upload-title">
                <div className="section-head"><div><p className="eyebrow">01 / Input</p><h2 id="upload-title" className="mt-1 text-xl font-semibold">Source photo</h2></div><span className="tag">MAX 8 MiB</span></div>
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} />
                {!preview ? <button type="button" onClick={() => input.current?.click()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }} onDragOver={(event) => event.preventDefault()} className="grid min-h-56 w-full place-items-center border border-dashed border-border bg-input px-6 text-center hover:border-cobalt"><span><Upload className="mx-auto mb-4 h-7 w-7 text-cobalt" /><strong className="block">Drop one clear photo here</strong><span className="mt-1 block text-sm text-muted">or click to browse · exactly one face</span></span></button> :
                  <div className="grid gap-5 sm:grid-cols-[180px_1fr]"><Image src={preview} alt="Selected source preview" width={360} height={176} unoptimized className="h-44 w-full object-cover" /><div className="min-w-0 self-center"><p className="truncate font-semibold">{file?.name}</p><p className="mt-1 text-sm text-muted">{file ? (file.size / 1024 / 1024).toFixed(2) : "0"} MiB · temporary original bytes</p><button onClick={() => input.current?.click()} className="control mt-4 border border-border">Replace photo</button></div></div>}
                <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-border pt-5 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--cobalt)]" /><span>I confirm this is my photo or a consenting teammate&apos;s public content, and I may send it to Google for this search.</span></label>
                <button onClick={search} disabled={!file || !consent || busy !== null} className="primary mt-5 w-full">{busy === "search" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{busy === "search" ? "Encoding and searching…" : "Find public matches"}</button>
              </section>

              <section id="results" className="panel" aria-labelledby="results-title">
                <div className="section-head"><div><p className="eyebrow">02 / Evidence</p><h2 id="results-title" className="mt-1 text-xl font-semibold">Returned pages</h2></div><span className="tag">{run?.candidates.length || 0} FOUND</span></div>
                {!run ? <div className="py-12 text-center text-sm text-muted">Live search results appear here. No invented matches are shown.</div> : run.candidates.length === 0 ? <div className="notice-warning">No matching pages were returned. Try a better-indexed photo.</div> :
                  <div className="space-y-3">{run.candidates.map((candidate) => { const result = candidate.face_verification; const active = selected === candidate.index; return (
                    <article key={`${candidate.page_url}-${candidate.index}`} className={`evidence-card border p-4 ${active ? "border-cobalt shadow-[var(--shadow)]" : "border-border"}`}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="mb-2 flex gap-2"><span className="tag text-cobalt">{candidate.reverse_match_type}</span><span className={`tag ${candidate.is_social ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{candidate.is_social ? "SOCIAL" : "NON-SOCIAL"}</span></div><h3 className="truncate font-semibold">{candidate.page_title || "Untitled returned page"}</h3><a href={candidate.page_url} target="_blank" rel="noopener noreferrer" className="mt-1 flex min-h-11 min-w-0 items-center gap-1 text-sm text-cobalt underline decoration-transparent underline-offset-4 hover:decoration-current"><span className="truncate">{candidate.page_url}</span><ArrowUpRight className="h-4 w-4 shrink-0" /></a></div>
                        <button onClick={() => verify(candidate.index)} disabled={busy !== null} className="control shrink-0 border border-border">{busy === "verify" && active ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}{result ? "Check again" : "Check face"}</button></div>
                      {result && <div className={`mt-3 border-l-4 p-3 text-sm ${result.status === "verified" ? "border-success bg-success-soft text-success" : result.status === "unavailable" ? "border-warning bg-warning-soft text-warning" : "border-danger bg-danger-soft text-danger"}`}><strong className="block">{result.status === "verified" ? "Face verified" : result.status === "unavailable" ? "Image unavailable — inspect manually" : "Face did not verify"}</strong><span>{result.distance === null ? result.reason : `Distance ${result.distance.toFixed(4)} · threshold ${result.threshold?.toFixed(4)}`}</span></div>}
                    </article>); })}</div>}
              </section>
            </div>

            <aside id="proof" className="space-y-5">
              <section className="panel"><p className="eyebrow">Live status</p><h2 className="mt-1 text-xl font-semibold">Pipeline readiness</h2><div className="mt-5 space-y-3">{Object.entries(health?.checks || { backend: health?.status === "online" }).map(([label, ready]) => <div key={label} className="flex items-center justify-between border-b border-border pb-3 text-sm last:border-0"><span>{label.replace(/([A-Z])/g, " $1")}</span><span className={`inline-flex items-center gap-1 font-mono text-xs ${ready ? "text-success" : "text-warning"}`}>{ready ? <Check className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}{ready ? "READY" : "SETUP"}</span></div>)}</div>{health?.error && <p className="mt-4 text-sm text-danger">{health.error}</p>}</section>
              <section className="panel"><p className="eyebrow">Run trace</p><h2 className="mt-1 text-xl font-semibold">Integrity proof</h2><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-muted">Run state</dt><dd className="mt-1 font-semibold">{run ? statusText[run.status] || run.status : "Waiting for input"}</dd></div><div><dt className="text-muted">Photo SHA-256</dt><dd className="mt-1 break-all font-mono text-xs">{short(run?.photoCommitment)}</dd></div><div><dt className="text-muted">0G storage root</dt><dd className="mt-1 break-all font-mono text-xs">{short(run?.storage?.rootHash)}</dd></div><div><dt className="text-muted">Chain record</dt><dd className="mt-1 font-mono text-xs">{run?.chain?.recordId ?? "Pending"}</dd></div></dl>{run?.status === "complete" && run.chain && <a href={run.chain.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-success-soft px-4 text-sm font-semibold text-success">View transaction<ArrowUpRight className="h-4 w-4" /></a>}</section>
              {choice && face && face.status !== "not_verified" && run?.status !== "complete" && <section className="panel border-cobalt shadow-[var(--shadow)]"><p className="eyebrow">Final gate</p><h2 className="mt-1 text-xl font-semibold">Confirm and publish</h2><p className="mt-2 text-sm text-muted">The matched URL and evidence become public in 0G Storage. The chain stores commitments.</p><label className="mt-5 block text-sm font-medium">Operator label<input value={operator} onChange={(event) => setOperator(event.target.value)} maxLength={80} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-input px-3 focus:border-cobalt" /></label><label className="check-row"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I opened the returned page and confirmed the consenting subject.</label><label className="check-row"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />I approve publishing this record to 0G testnet.</label>{!health?.commitReady && <p className="mt-4 text-xs text-warning">Wallet or contract setup is incomplete. Backend preflight will block writes.</p>}<button onClick={commit} disabled={!eligible || busy !== null} className="primary mt-5 w-full">{busy === "commit" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{busy === "commit" ? "Publishing and verifying…" : "Commit verified record"}</button></section>}
            </aside>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{busy ? `${busy} in progress` : run ? statusText[run.status] || run.status : "Ready"}</p>
      </main>
    </div>
  );
}

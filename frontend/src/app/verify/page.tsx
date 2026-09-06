"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, Upload, X, Loader2, CheckCircle2, AlertCircle, Search, Database } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const sidebarItems = [
  { icon: Camera, label: "New" },
  { icon: Upload, label: "Upload" },
  { icon: Search, label: "Search" },
  { icon: Database, label: "Records" },
  { icon: CheckCircle2, label: "Verified" },
  { icon: AlertCircle, label: "History" },
] as const;

type SidebarItem = typeof sidebarItems[number];

interface ImageRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  preview: string;
  status: "idle" | "encoding" | "ready" | "error";
}

export default function VerifyInterfacePage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; recordId?: number } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = ev.target?.result as string;
        setImages((prev) => [...prev, { id: Math.random().toString(36).slice(2), name: file.name, type: file.type, size: file.size, preview, status: "idle" }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = ev.target?.result as string;
        setImages((prev) => [...prev, { id: Math.random().toString(36).slice(2), name: file.name, type: file.type, size: file.size, preview, status: "idle" }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCameraStream(stream);
      setCameraOpen(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {}
  }, []);

  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg");
    setImages((prev) => [...prev, { id: Math.random().toString(36).slice(2), name: "capture.jpg", type: "image/jpeg", size: dataUrl.length, preview: dataUrl, status: "idle" }]);
    if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); setCameraStream(null); }
    setCameraOpen(false);
  }, [cameraStream]);

  const removeImage = useCallback((id: string) => setImages((prev) => prev.filter((i) => i.id !== id)), []);

  const handleEncode = useCallback(async (imageId: string) => {
    setImages((prev) => prev.map((i) => (i.id === imageId ? { ...i, status: "encoding" } : i)));
    await new Promise((r) => setTimeout(r, 1500));
    setImages((prev) => prev.map((i) => (i.id === imageId ? { ...i, status: "ready" } : i)));
  }, []);

  const handleSubmit = useCallback(async () => {
    const ready = images.filter((i) => i.status === "ready");
    if (ready.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/pipeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: ready[0].preview, note }) });
      setResult(await res.json());
    } catch { setResult({ status: "error" }); }
    finally { setLoading(false); }
  }, [images, note]);

  const formatSize = useCallback((bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className={cn("fixed left-0 top-0 z-40 h-full border-r border-border/50 bg-background/50 backdrop-blur-sm transition-all duration-300 flex flex-col", sidebarOpen ? "w-56" : "w-14")}>
        <div className="flex h-14 items-center justify-between px-4 border-b border-border/50">
          {sidebarOpen && <div className="flex items-center gap-2"><Camera className="h-4 w-4" /><span className="text-xs font-bold tracking-[0.2em] uppercase">FaceChain</span></div>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-md p-1 hover:bg-accent/5 transition-colors">
            {sidebarOpen ? <X className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-1.5 space-y-0.5">
          {sidebarItems.map((item) => (
            <button key={item.label} className={cn("w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors", item.label === "New" ? "bg-accent/10 text-foreground" : "text-muted hover:bg-accent/5 hover:text-foreground")}>
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        {sidebarOpen && (
          <div className="border-t border-border/50 p-3">
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span>Secured on 0G</span>
            </div>
          </div>
        )}
      </aside>

      <main className={cn("flex-1 flex flex-col overflow-y-auto", sidebarOpen ? "ml-56" : "ml-14")}>
        <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-sm">
          <div className="flex h-12 items-center justify-between px-8">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-bold tracking-tight">Face Chain Verifier</h1>
              <Badge variant="secondary" className="text-[10px]">0G Galileo</Badge>
            </div>
            {images.filter((i) => i.status === "ready").length > 0 && <Badge variant="secondary" className="text-[10px]">{images.filter((i) => i.status === "ready").length} encoded</Badge>}
          </div>
        </header>

        <div className="flex-1 p-10">
          {result ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              {result.status === "success" ? (
                <>
                  <CheckCircle2 className="mb-4 h-14 w-14 text-green-500" />
                  <h2 className="mb-1.5 text-xl font-bold">Verification Submitted</h2>
                  <p className="mb-5 text-xs text-muted">Record #{result.recordId} committed to 0G Galileo</p>
                  <Link href={`https://chainscan-galileo.0g.ai/tx/${result.recordId}`} target="_blank" rel="noopener" className="text-xs font-medium underline">View on Explorer</Link>
                </>
              ) : (
                <>
                  <AlertCircle className="mb-4 h-14 w-14 text-red-500" />
                  <h2 className="mb-1.5 text-xl font-bold">Submission Failed</h2>
                  <p className="mb-5 text-xs text-muted">Please try again</p>
                </>
              )}
              <Button variant="outline" onClick={() => { setResult(null); setImages([]); setNote(""); }}>New Verification</Button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-10">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Verify a Face</h2>
                <p className="text-xs text-muted">Upload an image or capture one to begin</p>
              </div>

              <Card className="cursor-pointer transition-shadow hover:shadow-md" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
                <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="mb-5 rounded-xl border border-dashed border-border/75 bg-input/50 p-6 w-72 flex flex-col items-center">
                    <Upload className="mx-auto mb-3 h-10 w-10 text-muted/70" />
                    <p className="mb-0.5 text-sm font-medium">Drag images here or click to upload</p>
                    <p className="text-[11px] text-muted">JPG, PNG. Max 8MB. One face required.</p>
                  </div>
                  <Input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Browse Files</Button>
                </CardContent>
              </Card>

              <div className="flex items-center justify-center gap-3">
                <span className="text-xs text-muted/50">or</span>
                <Button variant="outline" onClick={openCamera} className="gap-2">
                  <Camera className="h-4 w-4" /> Capture from Camera
                </Button>
              </div>

              {images.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">{images.length} image{images.length !== 1 ? "s" : ""}</span>
                    <Button variant="ghost" size="sm" onClick={() => setImages([])} className="h-6 text-[11px]"><X className="h-3 w-3 mr-1" /> Clear</Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {images.map((img) => (
                      <div key={img.id} className="relative rounded-xl border border-border/75 bg-card overflow-hidden group">
                        <img src={img.preview} alt={img.name} className="h-36 w-full object-cover" />
                        <button onClick={() => removeImage(img.id)} className="absolute right-2 top-2 rounded-full bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
                        <div className="p-2.5 flex items-center justify-between">
                          <div className="min-w-0"><p className="truncate text-[11px] font-medium">{img.name}</p><p className="text-[10px] text-muted">{formatSize(img.size)}</p></div>
                          {img.status === "idle" && <Button variant="outline" size="sm" onClick={() => handleEncode(img.id)} className="text-[11px] h-6">Encode</Button>}
                          {img.status === "encoding" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
                          {img.status === "ready" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                          {img.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Card className="py-6 px-8">
                <label className="text-xs font-medium">Notes</label>
                <Textarea placeholder="Add any context about this verification..." value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 min-h-[60px] text-xs" />
              </Card>

              <div className="flex justify-end gap-3">
                <Button variant="outline" size="default">Save Draft</Button>
                <Button size="default" onClick={handleSubmit} disabled={loading || images.filter((i) => i.status === "ready").length === 0}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {loading ? "Submitting..." : "Submit for Verification"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="flex flex-col items-center gap-4">
            <video ref={videoRef} autoPlay playsInline className="h-[75vh] w-auto max-w-lg rounded-lg" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-3">
              <Button size="default" onClick={captureImage} className="gap-2"><Camera className="h-4 w-4" /> Capture</Button>
              <Button variant="outline" size="default" onClick={() => { if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); setCameraStream(null); } setCameraOpen(false); }}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

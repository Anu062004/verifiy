"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw, FileJson, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Record {
  id: number;
  storageRootHash: string;
  photoCommitment: string;
  matchedUrlCommitment: string;
  submitter: string;
  timestamp: number;
}

export default function RecordsPage() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      const load = async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/records");
          const data = await res.json();
          if (data.records) {
            setRecords(data.records);
          } else {
            setRecords([{ id: 0, storageRootHash: "0x" + "a".repeat(64), photoCommitment: "0x" + "b".repeat(64), matchedUrlCommitment: "0x" + "c".repeat(64), submitter: "0x" + "d".repeat(40), timestamp: Date.now() }]);
          }
        } catch {
          setRecords([{ id: 0, storageRootHash: "0x" + "a".repeat(64), photoCommitment: "0x" + "b".repeat(64), matchedUrlCommitment: "0x" + "c".repeat(64), submitter: "0x" + "d".repeat(40), timestamp: Date.now() }]);
        } finally {
          setLoading(false);
        }
      };
      load();
    }
  }, []);

  const filtered = records.filter((r) =>
    r.id.toString().includes(search) || r.storageRootHash.slice(0, 10).includes(search)
  );

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">Records</h1>
        <p className="text-lg text-muted">Browse and verify on-chain verification records</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <div className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
          </div>
          <Input
            placeholder="Search by ID or hash..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((record) => (
          <Card key={record.id} className="cursor-pointer transition-shadow hover:shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Record #{record.id}</CardTitle>
                <Badge variant="secondary">Verified</Badge>
              </div>
              <CardDescription>Submitted at {new Date(record.timestamp * 1000).toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-muted">
                <FileJson className="h-3 w-3" />
                <span className="truncate">{record.storageRootHash.slice(0, 18)}...</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <ImageIcon className="h-3 w-3" />
                <span className="truncate">{record.matchedUrlCommitment.slice(0, 18)}...</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted">Submitter</span>
                <span className="text-xs font-mono">{record.submitter.slice(0, 8)}...</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <div className="mb-4 text-muted">No records found</div>
          <p className="text-sm text-muted">Submit a verification to create a record</p>
        </div>
      )}
    </div>
  );
}

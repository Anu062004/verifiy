"use client";

import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { Camera, Shield, Database } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Camera className="h-6 w-6" />
          <span className="text-lg font-semibold tracking-tight">Face Chain Verifier</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/10">
            Dashboard
          </Link>
          <Link href="/records" className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/10">
            Records
          </Link>
          <Link href="/verify" className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/10">
            Verify
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <p className="text-sm text-muted">
          Face Chain Verifier — Blockchain-verified face verification pipeline
        </p>
        <div className="flex items-center gap-6 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Secured
          </span>
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            0G Storage
          </span>
        </div>
      </div>
    </footer>
  );
}

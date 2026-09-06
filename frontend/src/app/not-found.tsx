import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-6xl font-bold">404</h1>
        <p className="text-lg text-muted">Page not found</p>
        <Link href="/" className="text-sm font-medium underline underline-offset-4">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

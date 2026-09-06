# Face Chain Verifier - Frontend Agent

## Project Overview
Next.js 16 frontend for the Face Chain Verifier pipeline with Swiss International Style design.

## Architecture
- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS 4
- **Theming**: next-themes (dark/light mode)
- **Icons**: lucide-react
- **Language**: TypeScript

## Design System
- **Style**: Swiss International (minimal, geometric, high contrast, grid-based)
- **Font**: Inter (sans-serif), JetBrains Mono (monospace)
- **Colors**: CSS custom properties with `background`, `foreground`, `muted`, `accent`, `card`, `border`, `input`
- **Spacing**: 4px base unit grid

## Theme System
- Light mode: white background, dark text
- Dark mode: near-black background, light text
- Toggle in header (sun/moon icon)
- `defaultTheme="light"` in ThemeProvider
- `enableSystem={false}` to prevent OS detection override

## Pages
- `/` — Dashboard (stats, pipeline status, recent activity)
- `/records` — Browse on-chain verification records with search
- `/verify` — Submit new face verification (3-step flow)

## API Routes
- `/api/records` — Fetch verification records from 0G Galileo contract
- `/api/pipeline` — Proxy to backend pipeline service
- `/api/storage` — Storage service health and operations
- `/api/chain` — Transaction receipt lookup

## Key Components
- `ThemeProvider` — next-themes wrapper with client directive
- `SiteHeader` / `SiteFooter` — Navigation and footer with theme toggle
- `Button`, `Card`, `Badge`, `Input`, `Textarea` — UI primitives
- `cn()` — clsx + tailwind-merge utility

## Environment Variables
Copy `.env.example` to `.env.local`:
- `RPC_URL` — 0G Galileo RPC endpoint
- `INDEXER_RPC` — 0G storage indexer
- `CONTRACT_ADDRESS` — Deployed registry contract
- `NEXT_PUBLIC_BACKEND_URL` — Backend pipeline service URL

## Running
```bash
cd frontend
npm install
npm run dev        # Dev server at localhost:3000
npm run build      # Production build
npm start          # Start production server
```

## Notes
- API routes use dynamic imports for `ethers` to avoid bundling issues
- Theme toggle requires `"use client"` directive
- All UI components use `cn()` for class merging
- Leave placeholder space for images/features not yet designed

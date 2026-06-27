# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: version-specific APIs

This is **Next.js 16.2.9 + React 19.2 + Tailwind CSS v4**. As `AGENTS.md` stresses, these versions have breaking changes from older releases. Before writing framework code, read the relevant guide in `node_modules/next/dist/docs/` rather than relying on memorized Next.js/React/Tailwind APIs.

Notable consequences:
- Tailwind v4 has no `tailwind.config.js`. Configuration lives in CSS via `app/globals.css`; PostCSS uses `@tailwindcss/postcss` (`postcss.config.mjs`).
- ESLint uses the flat-config format (`eslint.config.mjs`) composing `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.

## Commands

- `npm run dev` — start the dev server at http://localhost:3000
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint (flat config)

No test runner is configured yet.

## Architecture

App Router project (everything under `app/`). `app/layout.tsx` is the root layout; it loads the Geist / Geist Mono fonts via `next/font/google` and exposes them as the `--font-geist-sans` / `--font-geist-mono` CSS variables used by Tailwind. Routes/pages live in `app/`.

Import alias: `@/*` maps to the repo root (see `tsconfig.json`).

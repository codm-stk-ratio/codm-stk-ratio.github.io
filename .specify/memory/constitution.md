# CODM STK Ratio Constitution

## Core Principles

### I. Client-Side Precision & Determinism
All STK (Shots-To-Kill), TTK (Time-To-Kill), probability distributions, and canvas chart exports run 100% client-side with zero backend dependencies. Damage math (`src/utils/ttkMath.ts`) and OCR image scanning (`src/utils/imageScanner.ts`) MUST produce deterministic, reproducible results across browsers and devices.

### II. Resolution & Localization Parity
Every user-facing UI label added or modified MUST include translations across all supported locales in `src/locales.ts` (`vi`, `en`, `th`, `zh`, `ja`, `ko`, `es`, `pt`, `ms`, `id`, `hi`). Canvas/PNG chart exports MUST stay visually synchronized with interactive SVG chart state (e.g., percentage visibility toggle and custom chart title).

### III. Type Safety & Zero-Error Verification
Strict TypeScript (`tsc -b`), `oxlint` (`npm run lint`), and Vite production builds (`npm run build`) MUST pass with zero errors after every implementation change before reporting completion.

### IV. Scoped, Minimal Changes
Avoid unnecessary abstractions or modifications to unrelated existing logic (`src/components/CharacterModel.tsx`, existing damage calculations) unless directly required by the specification. Keep state persistence backward-compatible via `localStorage`.

## Technical Stack & Standards

- **Framework**: React 19 + TypeScript + Vite
- **Linting & Build**: `npm.cmd run lint` (`oxlint`), `npm.cmd run build` (`tsc -b && vite build`)
- **Primary Source Layout**: `src/App.tsx`, `src/index.css`, `src/locales.ts`, `src/components/`, `src/utils/`

## Governance

This constitution establishes project-wide conventions for Spec Kit specs, plans, tasks, and implementations within `e:\save\calc`. Feature branches or temporary artifacts MUST not modify or commit generated diagram scratch files (e.g. `erd_chen.svg`).

**Version**: 1.0.0 | **Ratified**: 2026-11-16 | **Last Amended**: 2026-11-16

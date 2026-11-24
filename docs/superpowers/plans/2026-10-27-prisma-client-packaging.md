# Prisma Client Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the generated Prisma Client is present and loadable in every packaged Electron build.

**Architecture:** Generate Prisma Client as part of the shared application build, have every platform packaging script use that build, and explicitly include and unpack `node_modules/.prisma` in Electron Builder.

**Tech Stack:** npm scripts, Prisma 7, Electron Vite, Electron Builder.

**Spec:** [2026-10-27-prisma-client-packaging-design.md](../specs/2026-10-27-prisma-client-packaging-design.md)

## Global Constraints

- Keep Prisma's current generated client location and runtime imports.
- Generate the client before packaging for Windows, macOS, and Linux.
- Preserve `**/*` inclusion and copy/unpack `node_modules/.prisma` in the packaged app.

## Review Focus

- A clean install without a previously generated client must generate it during the shared build; verify with `npm run build`.
- Each platform packaging script must use the shared build; inspect the script definitions for Windows, macOS, and Linux.
- The generated module must not be omitted from ASAR packaging; verify `node_modules/.prisma/client/default.js` in the built app.
- The runtime client layout must remain unchanged; verify the generated client's existing path is retained.
- Build/typecheck errors must fail the packaging command rather than being bypassed; run `npm run build:unpack`.

---

### Task 1: Include Prisma Client in all packaged builds

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.yml`

**Interfaces:**
- Consumes: Existing `db:generate` and `build` npm scripts.
- Produces: `build` runs Prisma generation before typecheck and Electron Vite; `build:mac` and `build:linux` package only after `npm run build`; Electron Builder includes and unpacks `node_modules/.prisma/**`.

- [x] **Step 1: Update npm scripts**

Add `npm run db:generate` before typecheck in `build`, and change `build:mac` and `build:linux` to run `npm run build` before Electron Builder. Keep `build:win` using the shared build.

- [x] **Step 2: Configure generated-client packaging**

Preserve `**/*` in Electron Builder's `files` patterns, add an explicit `FileSet` from `node_modules/.prisma` to `node_modules/.prisma`, add the generated client to `asarUnpack`, and retain the existing exclusions.

- [x] **Step 3: Run typecheck and build**

Run: `npm run build`
Expected: Prisma generation, node and web typechecks, and Electron Vite build all pass.

- [x] **Step 4: Build and verify the unpacked package**

Run: `npm run build:unpack`
Expected: The command passes and `dist/win-unpacked/resources/app.asar.unpacked/node_modules/.prisma/client/default.js` exists.

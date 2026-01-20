# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

`isolate-package` is a CLI tool that isolates a monorepo workspace package into
a self-contained directory with all internal dependencies and an adapted
lockfile. It's primarily used for deploying monorepo packages (especially
Firebase functions) without bundling the entire monorepo.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build with tsup-node
pnpm dev              # Development mode with watch
pnpm test             # Run all tests with Vitest
pnpm test <pattern>   # Run specific test file
pnpm lint             # Lint with ESLint
pnpm check-types      # TypeScript type checking
pnpm check-format     # Check code formatting
pnpm format           # Format with Prettier
```

## Architecture

### Entry Points

- `src/isolate-bin.ts` - CLI binary entry (`npx isolate`)
- `src/index.ts` - Library API entry
  (`import { isolate } from "isolate-package"`)
- `src/isolate.ts` - Main orchestration logic

### Core Modules (`src/lib/`)

**config.ts** - Configuration loading and validation. Reads
`isolate.config.json` and merges with defaults.

**registry/** - Builds a `PackagesRegistry` (Record<name, WorkspacePackageInfo>)
by scanning workspace package directories. Used to resolve internal dependencies
by name.

**package-manager/** - Detects the workspace's package manager
(npm/pnpm/yarn/bun) from lockfiles and manifests.

**manifest/** - Handles package.json operations:

- Validates required fields (version, files)
- Adapts internal dependency versions to use `file:` protocol
- Handles pnpm-specific fields

**lockfile/** - Generates isolated lockfiles for each package manager:

- PNPM: Prunes and adapts lockfile using `@pnpm/lockfile-file` and
  `@pnpm/prune-lockfile` (supports v8 and v9)
- NPM: Uses `@npmcli/arborist` to generate from node_modules
- Yarn: Generates from node_modules

**output/** - Handles file operations:

- `pack-dependencies.ts` - Packs internal dependencies using npm/pnpm pack
- `unpack-dependencies.ts` - Extracts packed tarballs to isolate directory
- `process-build-output-files.ts` - Copies target package build output

**patches/** - Handles PNPM patched dependencies:

- `copy-patches.ts` - Copies relevant patch files from workspace root to isolate
  directory, filtering based on target package dependencies

### Key Types (`src/lib/types.ts`)

- `PackageManifest` - Extended pnpm package manifest type
- `PackagesRegistry` - Maps package names to their paths and manifests
- `WorkspacePackageInfo` - Package metadata (absoluteDir, rootRelativeDir,
  manifest)
- `PatchFile` - Represents a patch file entry with path and hash

### Process Flow

1. Resolve configuration (defaults + isolate.config.json + API args)
2. Detect package manager and locate workspace root
3. Build packages registry from workspace definitions
4. Recursively find all internal dependencies
5. Pack and unpack internal dependencies to isolate directory
6. Adapt manifests to use `file:` references
7. Copy PNPM patched dependencies (if any exist)
8. Generate pruned lockfile for the isolated package
9. Copy workspace config files (.npmrc, pnpm-workspace.yaml)

## Path Alias

The codebase uses `~/` as path alias for `src/` (configured in tsconfig.json).

## Testing

Tests use Vitest and are co-located with source files (`*.test.ts`).

## Code Style

- Use JSDoc style comments (`/** ... */`) for all comments, including
  single-line comments

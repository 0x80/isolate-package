# Comparison with pnpm deploy

PNPM has a built-in
[`pnpm deploy`](https://pnpm.io/cli/deploy) command that solves a similar
problem: extracting a workspace package for deployment. This page explains how
they differ and when to use which.

## How they work

### pnpm deploy

`pnpm deploy` copies a workspace package to a target directory and runs a full
install there, producing a ready-to-run output with a populated `node_modules`.
Internal workspace dependencies are bundled into the output automatically.

It is tightly coupled to PNPM and only works in PNPM workspaces.

### isolate-package

`isolate-package` produces a self-contained source directory containing the
target package, its internal dependencies as `file:` references, and a pruned
lockfile. No install is performed — the deployment target is expected to run its
own `install` step.

It works with NPM, PNPM, Yarn (classic and modern), and Bun.

## Key differences

|                     | **pnpm deploy**          | **isolate-package**            |
| ------------------- | ------------------------ | ------------------------------ |
| Package managers    | PNPM only                | NPM, PNPM, Yarn, Bun           |
| Output              | Installed `node_modules` | Manifests + pruned lockfile    |
| Install step        | Performed during deploy  | Performed by deployment target |
| Firebase compatible | No                       | Yes                            |
| Lockfile included   | No                       | Yes                            |

## Firebase compatibility

Firebase-tools deployment expects a source directory with a `package.json` and a
lockfile. It runs its own `npm install` (or equivalent) as part of the deployment
process. `pnpm deploy` cannot produce this kind of output because it delivers a
pre-installed `node_modules` instead of the manifest-and-lockfile combination
that Firebase expects.

The
[firebase-tools-with-isolate](https://github.com/0x80/firebase-tools-with-isolate)
fork integrates `isolate-package` directly into the deployment pipeline, so the
isolation step runs transparently as part of `firebase deploy`.

## When to use which

**Use `pnpm deploy`** when you are in a PNPM monorepo and your deployment target
expects a ready-to-run directory with `node_modules` already in place, for
example Docker or container-based workflows.

**Use `isolate-package`** when your deployment target performs its own install
step (Firebase, most serverless platforms), when you need a pruned lockfile for
deterministic installs, or when your monorepo uses a package manager other than
PNPM.

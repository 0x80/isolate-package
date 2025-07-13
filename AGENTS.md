# Isolate Package - Development Rules

## Project Overview

`isolate-package` is a tool for isolating monorepo workspace packages into
self-contained directories with their internal dependencies and adapted
lockfiles. It's particularly useful for deploying to platforms like Firebase
from a monorepo without complex scripting.

## Core Concepts

- **Package Isolation**: Extracts a package from a monorepo with all its
  internal dependencies
- **Lockfile Adaptation**: Generates or adapts lockfiles for the isolated
  package structure
- **Multi-Package Manager Support**: Works with NPM, PNPM, Yarn, and partially
  with Bun
- **Firebase Integration**: Special support for Firebase deployments

## Code Style and Conventions

### TypeScript

- Use TypeScript for all source files
- Target ES modules (ESM) - the project uses `"type": "module"`
- Use path aliases: `~` maps to `src/` directory
- Prefer `node:` prefix for Node.js built-in modules (e.g., `node:path`,
  `node:assert`)
- Use `satisfies` operator for type-safe object literals where appropriate

### Functional Programming

- Prefer functional approaches over class-based ones (as seen in the recent
  Config refactor)
- Use pure functions where possible
- Avoid unnecessary state management
- Use `remeda` for functional utilities (not lodash)

### Error Handling

- Use `assert` from `node:assert` for critical validations
- Use the `getErrorMessage` utility for consistent error message extraction
- Provide clear, actionable error messages

### Logging

- Use the centralized logger from `lib/logger`
- Follow the log level hierarchy: debug < info < warn < error
- Use `debug` for detailed implementation info
- Use `info` for important user-facing information
- Include context in log messages (file paths, package names, etc.)

### File Organization

```
src/
├── lib/
│   ├── config.ts          # Configuration management
│   ├── logger.ts          # Logging utilities
│   ├── types.ts           # Shared type definitions
│   ├── lockfile/          # Lockfile processing logic
│   ├── manifest/          # Package.json manipulation
│   ├── output/            # Output generation
│   ├── package-manager/   # Package manager detection/handling
│   ├── registry/          # Package registry management
│   └── utils/             # General utilities
├── isolate.ts             # Main isolation logic
├── isolate-bin.ts         # CLI entry point
└── index.ts               # Library export
```

### Testing

- Use Vitest for testing
- Place test files next to the source files with `.test.ts` suffix
- Write focused unit tests for utility functions
- Use descriptive test names with `describe` and `it`

### Dependencies

- Use `fs-extra` instead of native `fs` for enhanced file operations
- Use `chalk` for colored console output
- Use `yaml` package for YAML parsing/writing
- Use `glob` for file pattern matching

## Key Implementation Patterns

### Package Manager Detection

```typescript
// Always use the centralized detection
const packageManager = detectPackageManager(workspaceRootDir);
// or for singleton usage within a module
const packageManager = usePackageManager();
```

### Path Handling

- Always use `path.join()` for cross-platform compatibility
- Never use string concatenation for paths
- Use utility functions for consistent path formatting:
  - `getRootRelativeLogPath()` for logging paths relative to root
  - `getIsolateRelativeLogPath()` for paths relative to isolate dir

### Manifest Manipulation

- Read manifests with `readTypedJson<PackageManifest>()`
- Write manifests with `writeManifest()`
- Always preserve unknown fields when modifying manifests
- Strip `devDependencies` and `scripts` from internal package manifests

### Async Operations

- Use async/await consistently
- Parallelize operations where possible with `Promise.all()`
- Handle file system operations carefully with proper error handling

## Configuration Philosophy

- Zero-config by default - most users shouldn't need configuration
- Configuration file: `isolate.config.json`
- Environment variables for debugging: `DEBUG_ISOLATE_CONFIG=true`
- Validate configuration keys and warn about unknown options

## Package Manager Specific Handling

### PNPM

- Preserve `workspace:*` specifiers in isolated output
- Copy or generate `pnpm-workspace.yaml`
- Handle Rush workspaces specially (generate workspace config)
- Prune lockfiles before writing

### NPM/Yarn

- Replace workspace specifiers with file paths
- Generate lockfiles based on node_modules content
- Handle different workspace configuration formats

## Pull Request Guidelines

- Keep changes focused and atomic
- Update tests for any logic changes
- Update README.md for user-facing changes
- Include clear commit messages
- Consider backward compatibility

### PR Summary Documentation

**Always create a PR summary when completing a task that involves code changes:**

1. Create or overwrite the `PR_SUMMARY.md` file at the project root
   - Note: This file is not in version control and may already exist from previous tasks
   - Always completely overwrite the existing content with new summary
2. Include the following sections:
   - **Problem**: Clear description of the issue being solved
   - **Root Cause**: Technical explanation of why the issue occurred
   - **Solution**: Code changes made with examples
   - **Benefits**: List of improvements and guarantees
   - **Testing**: Verification steps taken (tests, compilation, build)
   - **Impact**: How this affects users and resolves the original issue
3. Link to relevant GitHub issues/PRs using markdown format
4. Use clear, technical language suitable for code review
5. Include code snippets to illustrate key changes

This documentation helps maintain project history and assists with code reviews.

## Common Pitfalls to Avoid

1. Don't assume a specific package manager - always detect
2. Don't use Windows-incompatible path operations
3. Don't forget to handle Rush workspaces specially
4. Don't include unnecessary files in the isolated output
5. Don't modify the original workspace files

## Performance Considerations

- Pack/unpack operations can be slow - show progress in debug mode
- Reuse package registry across operations
- Clean up temporary directories only on success (aids debugging)
- Use streaming operations for large files when possible

## Security Considerations

- Validate all file paths to prevent directory traversal
- Be careful with shell command execution
- Don't expose sensitive configuration in logs

## Future Compatibility

- Design APIs to be extensible
- Keep backward compatibility in mind
- Document breaking changes clearly
- Use semantic versioning

## Debug Mode Guidelines

When `logLevel` is set to `"debug"`:

- Log all major operations
- Include file paths and package names
- Show timing information for slow operations
- Keep temporary directories for inspection

## Firebase-Specific Considerations

- Support both 1st and 2nd generation functions
- Handle `firebase.json` configuration
- Copy `.npmrc` files for authentication
- Consider the firebase-tools-with-isolate fork

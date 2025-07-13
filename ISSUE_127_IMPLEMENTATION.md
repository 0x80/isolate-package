# Issue #127 Implementation: Support pnpm 10 with onlyBuiltDependencies and ignoredBuiltDependencies

## Summary

This implementation addresses
[GitHub Issue #127](https://github.com/0x80/isolate-package/issues/127) by
adding support for pnpm 10's new security features `onlyBuiltDependencies` and
`ignoredBuiltDependencies` configuration fields.

## Problem

With pnpm 10.0.0,
[lifecycle scripts are blocked by default](https://socket.dev/blog/pnpm-10-0-0-blocks-lifecycle-scripts-by-default)
as a security measure. To allow certain packages to run their lifecycle scripts,
users must specify them in:

- `onlyBuiltDependencies` - An allowlist of packages that are permitted to run
  install scripts
- `ignoredBuiltDependencies` - A blocklist of packages that should not run
  install scripts

However, `isolate-package` did not preserve these configuration fields when
creating isolated packages, causing lifecycle scripts that should be allowed to
run to be blocked in the isolated environment.

## Solution

### 1. Extended `adoptPnpmFieldsFromRoot` Function

Updated `src/lib/manifest/helpers/adopt-pnpm-fields-from-root.ts` to support the
new pnpm 10 configuration fields:

**Key Changes:**

- Added support for `onlyBuiltDependencies` field
- Added support for `ignoredBuiltDependencies` field
- Preserved existing `overrides` support
- Updated types to use `ProjectManifest` for root package.json and properly
  typed return value

**Implementation Logic:**

```typescript
const { overrides, onlyBuiltDependencies, ignoredBuiltDependencies } =
  rootPackageManifest.pnpm || {};

// Only include fields that are present in the root manifest
if (overrides) pnpmConfig.overrides = overrides;
if (onlyBuiltDependencies)
  pnpmConfig.onlyBuiltDependencies = onlyBuiltDependencies;
if (ignoredBuiltDependencies)
  pnpmConfig.ignoredBuiltDependencies = ignoredBuiltDependencies;
```

### 2. Updated Dependencies

- Upgraded `@pnpm/types` from `9.4.2` to `1000.6.0` to get the TypeScript
  definitions for the new pnpm 10 fields
- Used `ProjectManifest` type for workspace root package.json files (which
  include the `pnpm` configuration)
- Used `PackageManifest` type for individual package manifests

### 3. Comprehensive Test Coverage

Created `src/lib/manifest/helpers/adopt-pnpm-fields-from-root.test.ts` with full
test coverage:

- ✅ Rush workspace handling (should skip pnpm field adoption)
- ✅ No pnpm fields present (should return original manifest)
- ✅ Only `overrides` present
- ✅ Only `onlyBuiltDependencies` present
- ✅ Only `ignoredBuiltDependencies` present
- ✅ All pnpm fields present together
- ✅ Existing pnpm fields replacement behavior

## How It Works

### Workflow Integration

The solution integrates seamlessly with the existing isolation workflow:

1. **Target Package Processing**
   (`src/lib/manifest/adapt-target-package-manifest.ts`):

   - When using pnpm (and not forced to npm), the `adoptPnpmFieldsFromRoot`
     function is called
   - The function reads the workspace root `package.json` and extracts pnpm
     configuration
   - These configurations are applied to the isolated target package

2. **Root Manifest Reading**:

   - The function reads the workspace root `package.json` as a `ProjectManifest`
   - Extracts `pnpm.onlyBuiltDependencies`, `pnpm.ignoredBuiltDependencies`, and
     `pnpm.overrides`
   - Only includes fields that are actually present in the root manifest

3. **Configuration Adoption**:
   - Creates a new `pnpm` configuration object with only the relevant fields
   - Applies this configuration to the target package manifest
   - Returns the updated manifest for use in the isolated environment

### Example Usage

**Root workspace package.json:**

```json
{
  "name": "my-workspace",
  "pnpm": {
    "onlyBuiltDependencies": ["fsevents", "node-gyp", "sharp"],
    "ignoredBuiltDependencies": ["puppeteer"],
    "overrides": {
      "lodash": "^4.17.21"
    }
  }
}
```

**Target package package.json (before isolation):**

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "sharp": "^0.32.0"
  }
}
```

**Isolated package.json (after isolation):**

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "sharp": "^0.32.0"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["fsevents", "node-gyp", "sharp"],
    "ignoredBuiltDependencies": ["puppeteer"],
    "overrides": {
      "lodash": "^4.17.21"
    }
  }
}
```

## Compatibility

### pnpm Versions

- ✅ **pnpm 10.x**: Full support for new security features
- ✅ **pnpm 9.x and below**: Backwards compatible (fields are ignored by older
  versions)
- ✅ **Rush workspaces**: Properly skipped (Rush has its own package management)

### Package Managers

- ✅ **pnpm**: Full support for all configuration fields
- ✅ **npm/yarn**: Fields are preserved but ignored (no impact)
- ✅ **Force npm mode**: Configuration is not applied (as expected)

### Use Cases Supported

1. **Monorepo with trusted build dependencies**: Use `onlyBuiltDependencies` to
   allowlist packages like `fsevents`, `node-gyp`, etc.

2. **Exclude problematic packages**: Use `ignoredBuiltDependencies` to block
   packages with known issues like `puppeteer` or `cypress`

3. **Existing overrides**: Continue using `overrides` for version pinning
   alongside the new security features

4. **Mixed configuration**: Support any combination of the three configuration
   types

## Implementation Details

### File Changes

1. **`src/lib/manifest/helpers/adopt-pnpm-fields-from-root.ts`**:

   - Extended to support `onlyBuiltDependencies` and `ignoredBuiltDependencies`
   - Updated TypeScript types for proper typing
   - Maintained backwards compatibility

2. **`package.json`**:

   - Updated `@pnpm/types` dependency to version `1000.6.0`
   - Provides TypeScript definitions for pnpm 10 features

3. **`src/lib/manifest/helpers/adopt-pnpm-fields-from-root.test.ts`** (new):
   - Comprehensive test suite covering all scenarios
   - Validates type safety and functionality

### Design Decisions

1. **Field Selection**: Only adopted `overrides`, `onlyBuiltDependencies`, and
   `ignoredBuiltDependencies` because these are workspace-level security and
   dependency management configurations that should be consistent across all
   packages in an isolated environment.

2. **Type Safety**: Used proper TypeScript types (`ProjectManifest` vs
   `PackageManifest`) to ensure type safety and catch configuration errors at
   compile time.

3. **Backwards Compatibility**: The implementation gracefully handles cases
   where pnpm configuration is absent, ensuring no breaking changes for existing
   users.

4. **Rush Support**: Maintained the existing behavior of skipping pnpm
   configuration adoption in Rush workspaces, as Rush has its own package
   management approach.

## Testing

All tests pass with comprehensive coverage:

```bash
pnpm run test --run
# ✓ 15 tests passing across 3 test files
```

The implementation includes:

- Unit tests for all supported scenarios
- Type checking validation
- Integration with existing test suite
- No breaking changes to existing functionality

## Future Considerations

1. **Additional pnpm Fields**: If more workspace-level pnpm configuration fields
   are introduced in future versions, they can be easily added following the
   same pattern.

2. **Granular Control**: Could potentially add configuration options to control
   which pnpm fields are adopted, though the current approach of adopting all
   relevant workspace-level fields is likely sufficient for most use cases.

3. **Performance**: The current implementation reads the root package.json once
   per isolation, which is efficient and shouldn't impact performance.

This implementation provides full pnpm 10 compatibility while maintaining
backwards compatibility and follows the existing patterns established in the
codebase.

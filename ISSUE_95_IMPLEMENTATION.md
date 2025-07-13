# Issue #95 Implementation: Detect Manifest Mandatory Fields

## Summary

This implementation addresses
[GitHub Issue #95](https://github.com/0x80/isolate-package/issues/95) by adding
validation for mandatory fields in package.json manifests across all packages in
a workspace.

## Problem

Previously, when required fields (`files` and `version`) were missing from
package.json files, the isolate process would fail silently without clear error
messages. Users couldn't be expected to read the documentation upfront to
understand these requirements.

## Solution

### 1. Created Validation Function (`src/lib/manifest/validate-manifest.ts`)

```typescript
export function validateManifestMandatoryFields(
  manifest: PackageManifest,
  packagePath: string
): void;
```

**Validates:**

- `version` field - Required for npm/pnpm pack to execute properly
- `files` field - Required as an array with at least one entry to declare what
  files should be included in the output

**Error Handling:**

- Provides clear, helpful error messages explaining why each field is required
- Uses the existing logger pattern for consistency
- Throws descriptive errors that halt the process early

### 2. Integration Points

**Package Registry Creation** (`src/lib/registry/create-packages-registry.ts`):

- Validates all workspace packages when building the registry
- Fails fast if any package has missing mandatory fields

**Target Package Validation** (`src/isolate.ts`):

- Validates the target package manifest before starting the isolation process
- Ensures the main package being isolated also has required fields

### 3. Test Coverage

Comprehensive test suite (`src/lib/manifest/validate-manifest.test.ts`)
covering:

- ✅ Valid manifests with all required fields
- ✅ Missing `version` field
- ✅ Missing `files` field
- ✅ Empty `files` array
- ✅ Invalid `files` field type
- ✅ Multiple missing fields
- ✅ Helpful error message content

## Benefits

1. **Early Detection**: Validation happens at the start of the process, not
   during pack operations
2. **Clear Error Messages**: Users get helpful explanations about why fields are
   required
3. **Better UX**: No more silent failures - users know exactly what to fix
4. **Consistent Patterns**: Follows existing codebase patterns for validation
   and error handling
5. **Comprehensive Coverage**: Validates both workspace packages and the target
   package

## Files Modified

- `src/lib/manifest/validate-manifest.ts` (new)
- `src/lib/manifest/validate-manifest.test.ts` (new)
- `src/lib/manifest/index.ts` (updated exports)
- `src/lib/registry/create-packages-registry.ts` (added validation)
- `src/isolate.ts` (added target package validation)

## Usage

The validation runs automatically during the isolation process. If a package is
missing required fields, users will see an error like:

```
Package at packages/my-package is missing mandatory fields: version, files.
The "version" field is required for pack to execute, and the "files" field is
required to declare what files should be included in the output.
See the documentation for more details.
```

This addresses the core issue of users encountering mysterious failures and
provides clear guidance on how to fix their package.json files.

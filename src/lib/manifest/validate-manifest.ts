import { useLogger } from "../logger";
import type { PackageManifest } from "../types";

/**
 * Validate that mandatory fields are present in the package manifest. These
 * fields are required for the isolate process to work properly.
 *
 * @param manifest - The package manifest to validate
 * @param packagePath - The path to the package (for error reporting)
 * @param requireFilesField - Whether to require the files field (true for
 *   production deps, false for dev-only deps)
 * @throws Error if mandatory fields are missing
 */
export function validateManifestMandatoryFields(
  manifest: PackageManifest,
  packagePath: string,
  requireFilesField = true
): void {
  const log = useLogger();
  const missingFields: string[] = [];

  /** The version field is required for all packages */
  if (!manifest.version) {
    missingFields.push("version");
  }

  /**
   * The files field is only required for production dependencies that will be
   * packed
   */
  if (
    requireFilesField &&
    (!manifest.files ||
      !Array.isArray(manifest.files) ||
      manifest.files.length === 0)
  ) {
    missingFields.push("files");
  }

  if (missingFields.length > 0) {
    const errorMessage = `Package at ${packagePath} is missing mandatory fields: ${missingFields.join(", ")}. See the documentation for more details.`;

    log.error(errorMessage);
    throw new Error(errorMessage);
  }

  log.debug(`Validated mandatory fields for package at ${packagePath}`);
}

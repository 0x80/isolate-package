import { useLogger } from "../logger";
import type { PackageManifest } from "../types";

/** 
 * Validate that mandatory fields are present in the package manifest.
 * These fields are required for the isolate process to work properly.
 * 
 * @param manifest - The package manifest to validate
 * @param packagePath - The path to the package (for error reporting)
 * @throws Error if mandatory fields are missing
 */
export function validateManifestMandatoryFields(
  manifest: PackageManifest,
  packagePath: string
): void {
  const log = useLogger();
  const missingFields: string[] = [];

  /** The version field is required for pack to execute */
  if (!manifest.version) {
    missingFields.push("version");
  }

  /** The files field is required for pack to extract the correct files */
  if (!manifest.files || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    missingFields.push("files");
  }

  if (missingFields.length > 0) {
    const errorMessage = `Package at ${packagePath} is missing mandatory fields: ${missingFields.join(", ")}. ` +
      `The "version" field is required for pack to execute, and the "files" field is required to declare what files should be included in the output. ` +
      `See the documentation for more details.`;
    
    log.error(errorMessage);
    throw new Error(errorMessage);
  }

  log.debug(`Validated mandatory fields for package at ${packagePath}`);
}
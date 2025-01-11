import fs from "fs-extra";
import path from "node:path";
import { omit } from "remeda";
import { useLogger } from "../logger";
import type { FirebaseFunctionsConfig } from "../types";
import { readTypedJson } from "../utils";

export async function handleFirebaseConfig({
  targetPackageDir,
  workspaceRootDir,
  isolateDir,
}: {
  targetPackageDir: string;
  workspaceRootDir: string;
  isolateDir: string;
}) {
  const log = useLogger();

  const targetHasFirebaseConfig = fs.existsSync(
    path.join(targetPackageDir, "firebase.json")
  );

  if (targetHasFirebaseConfig) {
    const firebaseConfig = await readTypedJson<{
      functions: FirebaseFunctionsConfig;
    }>(path.join(targetPackageDir, "firebase.json"));

    if (firebaseConfig.functions.predeploy) {
      log.warn(
        "The firebase predeploy phase is not supported by isolate-package and will be ignored. Please execute the predeploy commands before executing isolate."
      );
    }

    fs.writeJsonSync(path.join(isolateDir, "firebase.json"), {
      ...firebaseConfig,
      functions: omit(firebaseConfig.functions, ["predeploy"]),
    });

    log.info("Included firebase config from the target package");
  }

  /**
   * If the target package does not have a firebase.json file, we will try to
   * extract the firebase config from the root firebase.json file, because that
   * is how Firebase recommends setting up a monorepo. See
   * https://firebase.google.com/docs/functions/organize-functions?gen=2nd#managing_multiple_source_packages_monorepo
   */
  if (!targetHasFirebaseConfig) {
    const rootHasFirebaseConfig = fs.existsSync(
      path.join(workspaceRootDir, "firebase.json")
    );

    if (rootHasFirebaseConfig) {
      log.debug("Attempting to extract firebase config from the root");

      const firebaseConfig = await readTypedJson<{
        functions: FirebaseFunctionsConfig[];
      }>(path.join(workspaceRootDir, "firebase.json"));

      const targetFolderName = path.basename(targetPackageDir);

      const extractedFunctionsConfig = firebaseConfig.functions.find((x) =>
        x.source.includes(targetFolderName)
      );

      if (extractedFunctionsConfig) {
        fs.writeJsonSync(path.join(isolateDir, "firebase.json"), {
          functions: {
            ...extractedFunctionsConfig,
            source: ".",
          },
        });

        log.info("Included firebase config extracted from the root");
      } else {
        /**
         * It could be that we are isolating a package for some other target
         * besides Firebase, so this might be totally normal behavior
         */
        log.debug(
          `No functions config found for ${targetFolderName} in the root firebase.json`
        );
      }
    }
  }
}

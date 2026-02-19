# CLI Reference

All [configuration options](/configuration) can be passed as CLI flags, which
take precedence over values in the config file. Run `npx isolate --help` for the
full list.

## Flags

| Flag                           | Short | Type     | Config Key               |
| ------------------------------ | ----- | -------- | ------------------------ |
| `--build-dir-name <name>`      | `-b`  | string   | `buildDirName`           |
| `--include-dev-dependencies`   | `-d`  | boolean  | `includeDevDependencies` |
| `--isolate-dir-name <name>`    | `-o`  | string   | `isolateDirName`         |
| `--log-level <level>`          | `-l`  | string   | `logLevel`               |
| `--target-package-path <path>` | `-t`  | string   | `targetPackagePath`      |
| `--tsconfig-path <path>`       | `-c`  | string   | `tsconfigPath`           |
| `--workspace-packages <glob>`  | `-w`  | string[] | `workspacePackages`      |
| `--workspace-root <path>`      | `-r`  | string   | `workspaceRoot`          |
| `--force-npm`                  |       | boolean  | `forceNpm`               |
| `--pick-from-scripts <name>`   | `-p`  | string[] | `pickFromScripts`        |
| `--omit-from-scripts <name>`   |       | string[] | `omitFromScripts`        |
| `--omit-package-manager`       |       | boolean  | `omitPackageManager`     |

## Usage Notes

Array flags are repeatable, for example:

```sh
npx isolate --pick-from-scripts build --pick-from-scripts start
```

Boolean flags support `--no-` negation, for example: `--no-force-npm`.

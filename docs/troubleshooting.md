# Troubleshooting

If something is not working as expected, run `npx isolate --log-level debug` or
add an `isolate.config.json` (or `.ts` / `.js`) file with `logLevel` set to
`"debug"`. This should give you detailed feedback in the console.

## Debug Configuration

In addition you can define an environment variable to debug the configuration
being used by setting `DEBUG_ISOLATE_CONFIG=true` before you execute `isolate`.

## Firebase Debugging

When debugging Firebase deployment issues it might be convenient to trigger the
isolate process manually with `npx isolate` and possibly
`DEBUG_ISOLATE_CONFIG=true npx isolate`.

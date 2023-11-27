/**
 * Test importing from a CJS context.
 *
 * This script will result in an error if normal required is used, because ESM
 * dependencies are not transpiled to CJS by a bundler.
 *
 * Error [ERR_REQUIRE_ESM]: require() of ES Module [module] is not supported.
 * Instead change the require of [filename] in [directory] to a dynamic import()
 * which is available in all CommonJS modules.
 */
(async () => {
  const { isolate } = await import("isolate-package");

  isolate()
    .then((isolateDir) => {
      console.log("Isolate created at", isolateDir);
    })
    .catch((err) => {
      console.error(err);
    });
})().then((err) => {
  console.error(err);
});

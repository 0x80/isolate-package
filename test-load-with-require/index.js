/**
 * This script will result in an error if ESM dependencies were not transpiled
 * to CJS.
 *
 * Error [ERR_REQUIRE_ESM]: require() of ES Module [module] is not supported.
 * Instead change the require of [filename] in [directory] to a dynamic import()
 * which is available in all CommonJS modules.
 */

const isolate = require("isolate-package");

console.log(isolate);
// isolate()
//   .then((isolateDir) => {
//     console.log("Isolate created at", isolateDir);
//   })
//   .catch((err) => {
//     console.error(err);
//   });

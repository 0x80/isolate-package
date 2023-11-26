#!/usr/bin/env node
import console from "node:console";
import sourceMaps from "source-map-support";
import { isolate } from "./isolate";

sourceMaps.install();

async function run() {
  await isolate();
}

run().catch((err) => {
  if (err instanceof Error) {
    console.error(err.stack);
    process.exit(1);
  } else {
    console.error(err);
  }
});

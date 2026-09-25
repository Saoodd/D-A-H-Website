/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload script by necessity: it patches Node's module resolver */
// Test-only: `server-only` is resolved by Next.js at build time and isn't
// an installed package, so map it to an empty module when unit-testing
// server modules (lib/cadImport.ts etc.) outside Next.
const Module = require("module");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return require.resolve("./stubs/empty.cjs");
  return original.call(this, request, ...rest);
};

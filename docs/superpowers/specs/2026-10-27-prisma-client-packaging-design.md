# Prisma Client Packaging Design

## Context

The packaged Electron application fails at startup because `@prisma/client`
cannot resolve the generated `node_modules/.prisma/client/default` module.
The current build scripts do not generate Prisma consistently for all target
platforms, and Electron Builder does not explicitly include or unpack the
generated client.

## Design

Keep the existing Prisma client location and runtime imports. Ensure every
platform build runs the shared build (including `prisma generate`) before
packaging, preserve the default `**/*` file inclusion while explicitly copying
`node_modules/.prisma` into the packaged app, and unpack the generated client
from ASAR so Prisma can load its runtime artifacts.

This is preferred over copying the client into application resources because
it preserves Prisma's expected module layout and avoids custom runtime paths.

## Verification

Run the project's build/typecheck and inspect the unpacked Windows package to
confirm `node_modules/.prisma/client/default.js` is present.

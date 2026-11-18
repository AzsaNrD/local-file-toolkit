import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standalone = join(root, ".next", "standalone");

// The standalone server does not carry the static files or public folder; the web build
// leaves those to a CDN, so they are copied in next to server.js here.
await cp(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
await cp(join(root, "public"), join(standalone, "public"), { recursive: true });

console.log("standalone server ready at", standalone);

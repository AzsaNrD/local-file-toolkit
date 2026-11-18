import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2] ?? "installer";

function run(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([join(root, "node_modules", "next", "dist", "bin", "next"), "build"], { ELECTRON_BUILD: "1" });
run([join(root, "scripts", "prepare-electron.mjs")]);

const electronCli = join(root, "node_modules", "electron-builder", "cli.js");
if (mode === "run") {
  run([join(root, "node_modules", "electron", "cli.js"), root]);
} else if (mode === "dir") {
  run([electronCli, "--win", "--dir"]);
} else {
  run([electronCli, "--win"]);
}

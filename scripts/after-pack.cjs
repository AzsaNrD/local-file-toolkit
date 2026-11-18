const { cpSync } = require("node:fs");
const path = require("node:path");

// electron-builder never copies a folder named node_modules into extraResources, but the
// standalone server needs its own. Copy it in after packing.
exports.default = async function afterPack(context) {
  const source = path.join(context.packager.projectDir, ".next", "standalone", "node_modules");
  const target = path.join(context.appOutDir, "resources", "server", "node_modules");
  cpSync(source, target, { recursive: true });
};

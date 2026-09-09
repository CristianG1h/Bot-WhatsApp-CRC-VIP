"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
let count = 0;
function scan(dir) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, file.name);
    if (file.isDirectory()) scan(p);
    else if (p.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
      if (result.status !== 0) { process.stderr.write(result.stderr); process.exitCode = 1; }
      count++;
    }
  }
}
for (const dir of ["src", "scripts", "test"]) if (fs.existsSync(dir)) scan(dir);
if (!process.exitCode) console.log("Sintaxis correcta en " + count + " archivos JavaScript.");

import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

const processes = [
  spawn(npm, ["run", "dev:api"], { stdio: "inherit", shell: false }),
  spawn(npm, ["run", "dev:web"], { stdio: "inherit", shell: false })
];

function shutdown(code = 0) {
  for (const child of processes) child.kill();
  process.exit(code);
}

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) shutdown(code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

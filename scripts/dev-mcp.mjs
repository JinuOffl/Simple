import { spawn, execSync } from "node:child_process";

const env = {
  ...process.env,
  MCP_LOCAL_DEV_OPEN: "true",
  GENERATION_LOCAL_DEV_OPEN: "true",
  VITE_LOCAL_MCP_ACTION_URL: "/local-functions/run-mcp-action",
  VITE_LOCAL_MANAGE_CONNECTION_URL: "/local-functions/manage-connection",
  VITE_LOCAL_GENERATE_APP_URL: "/local-functions/generate-app",
};

const isWin = process.platform === "win32";
const npxBin = isWin ? "npx.cmd" : "npx";

const denoProc = spawn(
  npxBin,
  [
    "deno",
    "run",
    "--config",
    "supabase/functions/deno.json",
    "--allow-net",
    "--allow-env",
    "--allow-read",
    "supabase/functions/_testing/local_dev_servers.ts",
  ],
  { stdio: "inherit", env, shell: isWin }
);

const viteProc = spawn(npxBin, ["vite"], {
  stdio: "inherit",
  env,
  shell: isWin,
});

function killTree(proc) {
  if (!proc || !proc.pid) return;
  if (isWin) {
    try {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
    } catch {
      // process already dead
    }
  } else {
    proc.kill();
  }
}

function shutdown() {
  killTree(denoProc);
  killTree(viteProc);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

denoProc.on("exit", (code) => {
  if (code && code !== 0) {
    killTree(viteProc);
    process.exit(code);
  }
});

viteProc.on("exit", (code) => {
  killTree(denoProc);
  process.exit(code ?? 0);
});


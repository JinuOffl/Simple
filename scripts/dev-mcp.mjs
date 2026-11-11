import { spawn } from "node:child_process";

const env = {
  ...process.env,
  MCP_LOCAL_DEV_OPEN: "true",
  VITE_LOCAL_MCP_ACTION_URL: "/local-functions/run-mcp-action",
  VITE_LOCAL_MANAGE_CONNECTION_URL: "/local-functions/manage-connection",
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
    "--allow-read=.env",
    "supabase/functions/_testing/local_dev_servers.ts",
  ],
  { stdio: "inherit", env, shell: isWin }
);

const viteProc = spawn(npxBin, ["vite"], {
  stdio: "inherit",
  env,
  shell: isWin,
});

function shutdown() {
  denoProc.kill();
  viteProc.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

denoProc.on("exit", (code) => {
  if (code && code !== 0) {
    viteProc.kill();
    process.exit(code);
  }
});

viteProc.on("exit", (code) => {
  denoProc.kill();
  process.exit(code ?? 0);
});


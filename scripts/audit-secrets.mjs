import { execSync } from "child_process";
import fs from "fs";

console.log("=== 1. Auditing Git Commit History ===");
const commits = execSync("git log --format=%H").toString().trim().split("\n");

const patterns = [
  { name: "Groq API Key (live)", regex: /gsk_[a-zA-Z0-9]{20,}/g },
  { name: "OpenAI Secret Key (live)", regex: /sk-[a-zA-Z0-9]{20,}/g },
  { name: "Anthropic Key (live)", regex: /sk-ant-[a-zA-Z0-9]{20,}/g },
  { name: "JWT Token (service_role or anon)", regex: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g },
  { name: "Private Key Header", regex: /-----BEGIN (RSA|EC|OPENSSH|PGP)?\s?PRIVATE KEY-----/g },
  { name: "Database URL with Password", regex: /postgres(ql)?:\/\/[^:]+:([^@\s]+)@/g }
];

let historyFindings = [];

for (const commit of commits) {
  const diff = execSync(`git show ${commit}`).toString();
  for (const { name, regex } of patterns) {
    const matches = diff.match(regex);
    if (matches) {
      for (const matchedStr of matches) {
        if (matchedStr.includes("queue-microtask") || matchedStr.includes("sha512")) continue;

        let isServiceRoleJwt = false;
        if (name.includes("JWT Token")) {
          try {
            const parts = matchedStr.split(".");
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
            if (payload.role === "service_role") isServiceRoleJwt = true;
          } catch {}
        }

        const isMock =
          matchedStr.includes("test") ||
          matchedStr.includes("mock") ||
          matchedStr.includes("abc123def456xyz789") ||
          matchedStr.includes("example") ||
          matchedStr.includes("your-");

        historyFindings.push({
          commit: commit.slice(0, 7),
          name,
          preview: matchedStr.slice(0, 10) + "..." + matchedStr.slice(-4),
          isMock,
          isServiceRoleJwt
        });
      }
    }
  }
}

console.log(`Commit history scan: ${historyFindings.length} findings.`);
for (const f of historyFindings) {
  console.log(`  [${f.commit}] ${f.name} (mock: ${f.isMock}, service_role: ${f.isServiceRoleJwt})`);
}

console.log("\n=== 2. Auditing Working Tree (Tracked Files) ===");
const trackedFiles = execSync("git ls-files").toString().trim().split("\n");
let workingFindings = [];

for (const file of trackedFiles) {
  if (!fs.existsSync(file)) continue;
  if (file === "scripts/audit-secrets.mjs") continue;
  const content = fs.readFileSync(file, "utf-8");

  for (const { name, regex } of patterns) {
    const matches = content.match(regex);
    if (matches) {
      for (const matchedStr of matches) {
        if (matchedStr.includes("queue-microtask") || matchedStr.includes("sha512")) continue;

        let isServiceRoleJwt = false;
        if (name.includes("JWT Token")) {
          try {
            const parts = matchedStr.split(".");
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
            if (payload.role === "service_role") isServiceRoleJwt = true;
          } catch {}
        }

        const isMock =
          matchedStr.includes("test") ||
          matchedStr.includes("mock") ||
          matchedStr.includes("abc123def456xyz789") ||
          matchedStr.includes("example") ||
          matchedStr.includes("your-");

        workingFindings.push({
          file,
          name,
          preview: matchedStr.slice(0, 10) + "..." + matchedStr.slice(-4),
          isMock,
          isServiceRoleJwt
        });
      }
    }
  }
}

console.log(`Working tree scan: ${workingFindings.length} findings.`);
for (const f of workingFindings) {
  console.log(`  [${f.file}] ${f.name} (mock: ${f.isMock}, service_role: ${f.isServiceRoleJwt})`);
}

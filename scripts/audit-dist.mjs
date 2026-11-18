import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const distDir = path.resolve(process.cwd(), "dist");

if (!fs.existsSync(distDir)) {
  console.error("audit-dist error: dist/ directory does not exist. Run 'npm run build' first.");
  process.exit(1);
}

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = getFilesRecursively(distDir);
const groqEnvKey = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || "").trim();

const forbiddenPatterns = [];
forbiddenPatterns.push({ pattern: "gsk_", description: "Groq API key prefix ('gsk_')" });

if (groqEnvKey.length >= 8) {
  forbiddenPatterns.push({ pattern: groqEnvKey, description: "Live GROQ_API_KEY env value" });
}

let violations = 0;

for (const filePath of allFiles) {
  // Only audit text files (js, html, css, map, txt, etc.)
  const ext = path.extname(filePath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'].includes(ext)) {
    continue;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  for (const { pattern, description } of forbiddenPatterns) {
    if (content.includes(pattern)) {
      console.error(`audit-dist VIOLATION in ${path.relative(process.cwd(), filePath)}: Found ${description}`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.error(`audit-dist FAILED: ${violations} secret violation(s) detected in dist/ bundle.`);
  process.exit(1);
}

console.log(`audit-dist PASSED: Audited ${allFiles.length} files in dist/. Zero secrets leaked.`);
process.exit(0);

import process from "node:process";

if (process.env.CI_SKIP_ENV_CHECK === "1") {
  console.log("[check-env] CI_SKIP_ENV_CHECK=1; skipping environment validation.");
  process.exit(0);
}

const errors = [];

const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl) {
  errors.push("Missing required env var: VITE_SUPABASE_URL");
} else if (!supabaseUrl.startsWith("https://")) {
  errors.push(`VITE_SUPABASE_URL must start with 'https://' (received: ${supabaseUrl})`);
}

if (!supabaseAnonKey) {
  errors.push("Missing required env var: VITE_SUPABASE_ANON_KEY");
}

// Client bundle leak danger: VITE_ prefixed secrets
if (process.env.VITE_GROQ_API_KEY) {
  errors.push("Security risk: VITE_GROQ_API_KEY is defined. Vite bundles all VITE_* variables into public client JS.");
}

// Production build check for server secrets accidentally exposed in frontend build env
const isProductionBuild =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL === "1" ||
  process.env.CF_PAGES === "1";

if (isProductionBuild) {
  if (process.env.GROQ_API_KEY) {
    errors.push("Security risk: GROQ_API_KEY is set in production build environment. Groq keys belong strictly in Supabase Edge Functions.");
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push("Security risk: SUPABASE_SERVICE_ROLE_KEY is set in production build environment. Service role keys must never touch frontend hosting.");
  }
}

if (errors.length > 0) {
  console.error("\n[check-env] Environment validation failed:");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.error("\nTo bypass for local testing or CI, set CI_SKIP_ENV_CHECK=1\n");
  process.exit(1);
}

console.log("[check-env] Environment validation passed.");

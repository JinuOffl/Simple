import { useNavigate } from "react-router-dom";

export function PrivacyScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-gradient-mesh text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-xl py-12 space-y-8 animate-fade-in">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between border-b border-n-border pb-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-xs font-mono uppercase tracking-widest text-n-text3 hover:text-white transition-colors cursor-pointer"
          >
            ← BACK
          </button>
          <span className="font-doto text-sm tracking-widest text-n-text2">
            SIMPLE // PRIVACY
          </span>
        </div>

        {/* Warning banner */}
        <div className="border border-white/40 bg-n-surface px-4 py-2 text-[10px] font-mono tracking-widest uppercase text-white">
          [EDIT BEFORE LAUNCH] PRE-RELEASE BETA PRIVACY POLICY
        </div>

        {/* Body content */}
        <div className="space-y-6 text-sm text-n-text2 leading-relaxed font-sans">
          <section className="space-y-2">
            <h2 className="text-white font-mono text-xs uppercase tracking-wider">
              1. Guest Mode & On-Device Storage
            </h2>
            <p>
              Guest data is stored on-device. When using Simple without an email account, your
              created tools, local variables, and state remain inside your browser&apos;s local
              storage and device memory. We do not persist guest session databases on our servers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-mono text-xs uppercase tracking-wider">
              2. Third-Party LLM Processing
            </h2>
            <p>
              Generations send your prompt to a third-party LLM provider. When you describe a tool,
              edit a manifest, or execute an AI action, the natural language prompt is transmitted to
              our backend proxy and processed by our third-party inference providers (such as Groq
              or OpenAI-compatible endpoints) strictly to produce the requested tool structure or
              response.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-mono text-xs uppercase tracking-wider">
              3. Connected Services & Credentials
            </h2>
            <p>
              When you supply personal API keys or connect external Model Context Protocol (MCP)
              servers, credentials are encrypted at rest using AES-GCM-256 with user isolation and
              are never returned in API responses or shared with other accounts.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-mono text-xs uppercase tracking-wider">
              4. Contact & Telemetry
            </h2>
            <p>
              [EDIT BEFORE LAUNCH: Insert official company contact email, privacy officer contact,
              and detailed jurisdiction-specific disclosures (GDPR / CCPA) prior to public release.]
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        doto: ["Doto", "monospace"],
        mono: ["Space Mono", "monospace"],
        sans: ["Space Mono", "monospace"], // override default sans
      },
      colors: {
        // Nothing OS monochrome palette
        "n-bg":       "#0a0a0a",
        "n-surface":  "#111111",
        "n-surface2": "#1a1a1a",
        "n-surface3": "#222222",
        "n-white":    "#ffffff",
        "n-text":     "rgba(255,255,255,1)",
        "n-text2":    "rgba(255,255,255,0.5)",
        "n-text3":    "rgba(255,255,255,0.2)",
        "n-border":   "rgba(255,255,255,0.08)",
        "n-border2":  "rgba(255,255,255,0.2)",
      },
      animation: {
        "fade-in":    "fadeIn 0.25s ease-out",
        "slide-up":   "slideUp 0.3s ease-out",
        "pulse-slow": "ntPulse 2s ease-in-out infinite",
        "blink":      "blink 1s step-end infinite",
        "dot-in":     "dotIn 0.4s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        ntPulse: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.3" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0" },
        },
        dotIn: {
          "0%":   { opacity: "0", transform: "scale(0.5)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

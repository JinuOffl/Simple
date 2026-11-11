import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
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
        // shadcn/ui tokens
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
  plugins: [tailwindcssAnimate],
};

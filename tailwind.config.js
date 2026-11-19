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
        grotesk: ["Space Grotesk", "sans-serif"],
        sans: ["Space Grotesk", "sans-serif"], // override default sans
      },
      colors: {
        // Nothing OS monochrome palette & 3-layer hierarchy (adaptive CSS variables)
        "n-display":   "var(--n-display)",
        "n-primary":   "var(--n-primary)",
        "n-secondary": "var(--n-secondary)",
        "n-disabled":  "var(--n-disabled)",

        // Surface layers (depth without blur)
        "n-bg":        "var(--n-bg)",
        "n-s1":        "var(--n-s1)",
        "n-s2":        "var(--n-s2)",
        "n-s3":        "var(--n-s3)",

        // Borders (1px only, never shadows)
        "n-line":      "var(--n-line)",
        "n-line2":     "var(--n-line2)",
        "n-line3":     "var(--n-line3)",

        // Inverted button tokens (always opposite text/bg)
        "n-btn":       "var(--n-btn-bg)",
        "n-btn-text":  "var(--n-btn-text)",

        // The ONE accent — Nothing Red
        "n-red":       "#D71921",
        "n-red-dim":   "var(--n-red-dim)",

        // Backwards-compatible tokens mapped to CSS variables
        "n-surface":   "var(--n-s1)",
        "n-surface2":  "var(--n-s2)",
        "n-surface3":  "var(--n-s3)",
        "n-white":     "var(--n-display)",
        "n-text":      "var(--n-primary)",
        "n-text2":     "var(--n-secondary)",
        "n-text3":     "var(--n-disabled)",
        "n-border":    "var(--n-line)",
        "n-border2":   "var(--n-line2)",
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
  plugins: [],
};

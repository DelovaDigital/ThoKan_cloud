import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:           "rgb(var(--bg)         / <alpha-value>)",
        fg:           "rgb(var(--fg)         / <alpha-value>)",
        card:         "rgb(var(--card)       / <alpha-value>)",
        "card-hover": "rgb(var(--card-hover) / <alpha-value>)",
        border:       "rgb(var(--border)     / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        muted:        "rgb(var(--muted)      / <alpha-value>)",
        accent:       "rgb(var(--accent)     / <alpha-value>)",
        "accent-fg":  "rgb(var(--accent-fg)  / <alpha-value>)",
        destructive:  "rgb(var(--destructive)/ <alpha-value>)",
        success:      "rgb(var(--success)    / <alpha-value>)",
        warning:      "rgb(var(--warning)    / <alpha-value>)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm:  "calc(var(--radius) - 0.25rem)",
        md:  "var(--radius)",
        lg:  "calc(var(--radius) + 0.125rem)",
        xl:  "calc(var(--radius) + 0.375rem)",
        "2xl": "calc(var(--radius) + 0.625rem)",
      },
      boxShadow: {
        sm:  "var(--shadow-sm)",
        md:  "var(--shadow-md)",
        lg:  "var(--shadow-lg)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-from-right": {
          from: { opacity: "0", transform: "translateX(12px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down":     "accordion-down 0.2s ease-out",
        "accordion-up":       "accordion-up 0.2s ease-out",
        "fade-up":            "fade-up 0.2s ease-out both",
        "slide-in-from-right":"slide-in-from-right 0.2s ease-out both",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [animate],
};

export default config;

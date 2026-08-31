/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        // `sans` is the one Tailwind applies by default. Setting only `body`
        // meant every ordinary screen fell through to the system stack while
        // the webfont was downloaded and never used.
        sans: ["Poppins", "system-ui", "sans-serif"],
        body: ["Poppins", "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Landing "precision instrument" palette
        ink: "#0A0A0A",
        paper: "#FAFAF8",
        accent: "#2A5BFF",
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        ticker: "ticker 32s linear infinite",
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light", "dark"],
  },
};

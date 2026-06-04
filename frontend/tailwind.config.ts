import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pg: {
          bg: "#FFFDF5",
          fg: "#1E293B",
          accent: "#8B5CF6",
          secondary: "#F472B6",
          tertiary: "#FBBF24",
          mint: "#34D399",
          muted: "#F1F5F9",
        }
      },
      transitionTimingFunction: {
        'bounce-pop': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      boxShadow: {
        'hard': '4px 4px 0px 0px #1E293B',
        'hard-hover': '6px 6px 0px 0px #1E293B',
        'hard-active': '2px 2px 0px 0px #1E293B',
        'sticker': '8px 8px 0px 0px #E2E8F0',
        'sticker-pink': '8px 8px 0px 0px #F472B6',
      },
      fontFamily: {
        heading: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
export default config;
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
        md: {
          background: "#FFFBFE",
          "on-background": "#1C1B1F",
          primary: "#6750A4",
          "on-primary": "#FFFFFF",
          "secondary-container": "#E8DEF8",
          "on-secondary-container": "#1D192B",
          tertiary: "#7D5260",
          "surface-container": "#F3EDF7",
          "surface-container-low": "#E7E0EC",
          outline: "#79747E",
          "on-surface-variant": "#49454F",
        }
      },
      borderRadius: {
        'md-xs': '8px',
        'md-sm': '12px',
        'md-md': '16px',
        'md-lg': '24px',
        'md-xl': '28px',
        'md-xxl': '32px',
        'md-xxxl': '48px',
      },
      transitionTimingFunction: {
        'md-emphasized': 'cubic-bezier(0.2, 0, 0, 1)',
      },
      boxShadow: {
        'md-elevation-1': '0px 1px 3px 1px rgba(0, 0, 0, 0.08), 0px 1px 2px 0px rgba(0, 0, 0, 0.04)',
        'md-elevation-2': '0px 2px 6px 2px rgba(0, 0, 0, 0.08), 0px 1px 2px 0px rgba(0, 0, 0, 0.04)',
        'md-elevation-3': '0px 4px 12px 3px rgba(0, 0, 0, 0.12), 0px 2px 6px 0px rgba(0, 0, 0, 0.06)',
      },
      fontFamily: {
        heading: ['var(--font-roboto)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-roboto)', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
export default config;
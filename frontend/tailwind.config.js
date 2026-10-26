/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        resq: {
          bg: '#FFFFFF',
          panel: '#EAF5FF',
          panelHover: '#DDF0FF',
          primary: '#168BFA',
          primaryDark: '#0f77d9',
          navy: '#102B4E',
          navyMuted: '#627D98',
          border: '#D0E6FC',
          card: '#FFFFFF',
          surface: '#F4FAFF',
        },
        navy: {
          950: '#060b13',
          900: '#0a1220',
          850: '#0e1a2e',
          800: '#13233e',
          700: '#1b3156',
          600: '#274472',
        },
        cyan: {
          DEFAULT: '#00f0ff',
          400: '#22d3ee',
          500: '#06b6d4',
          glow: 'rgba(0, 240, 255, 0.4)'
        },
        teal: {
          DEFAULT: '#14b8a6',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        emergency: {
          red: '#ef4444',
          amber: '#f59e0b',
          green: '#10b981',
          purple: '#a855f7'
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Outfit', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}

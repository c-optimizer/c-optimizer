/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'c-bg': '#0F172A',
        'c-primary': '#00FF88',
        'c-secondary': '#00D2FF',
        'c-danger': '#FF3366',
        'c-surface': '#1A2332',
        'c-border': '#2A3446'
      },
      boxShadow: {
        'glow-primary': '0 0 15px rgba(0, 255, 136, 0.35)',
        'glow-secondary': '0 0 15px rgba(0, 210, 255, 0.35)',
        'glow-danger': '0 0 15px rgba(255, 51, 102, 0.35)'
      }
    },
  },
  plugins: [],
}
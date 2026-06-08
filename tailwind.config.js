/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#111827',
          soft: 'rgba(17, 24, 39, 0.06)',
        }
      },
      fontFamily: {
        sans: ['"Avenir Next"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}

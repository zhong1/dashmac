/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0d1117',
          secondary: '#161b22',
          tertiary: '#1c2128',
        },
        border: {
          primary: '#30363d',
          secondary: '#21262d',
        },
        text: {
          primary: '#c9d1d9',
          secondary: '#8b949e',
          muted: '#484f58',
        },
        status: {
          green: '#3fb950',
          yellow: '#d29922',
          red: '#f85149',
          blue: '#1f6feb',
        },
      },
      fontFamily: {
        mono: ['SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

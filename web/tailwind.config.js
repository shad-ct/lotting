/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#a3e635',
          dim: '#65a30d',
        },
      },
    },
  },
  plugins: [],
};

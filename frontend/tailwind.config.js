/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111111',
        sand: '#f4eee2',
        ember: '#e76f51',
        moss: '#3d5a40',
        fog: '#c8c0b6',
      },
      fontFamily: {
        display: ['Georgia', 'serif'],
        body: ['Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

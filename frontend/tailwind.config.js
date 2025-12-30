/* Full path: frontend/tailwind.config.js */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class', // Enable dark mode with class strategy
  theme: {
    extend: {
      colors: {
        'soft-orange': '#FF9F66',
        'soft-grey': '#6B7280',
      }
    },
  },
  plugins: [],
}
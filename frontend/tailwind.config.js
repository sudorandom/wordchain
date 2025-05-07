const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'bungee': ['Bungee', ...defaultTheme.fontFamily.sans],
        // Add other custom fonts if needed
        sans: ['Inter var', ...defaultTheme.fontFamily.sans],
      },
      // You can add dark mode specific colors here if needed,
      // but often using dark: variants on existing colors is enough.
    },
  },
  plugins: [],
}

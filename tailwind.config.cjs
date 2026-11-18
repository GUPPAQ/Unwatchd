/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

// Film-night palette. The markup and JS use Tailwind's stock colour names; remapping them
// here moves every generated screen (film pages, actor pages, menus) into the palette at once.
const ember = {
  50: '#fff3ef', 100: '#ffe3da', 200: '#ffc6b5', 300: '#ffa088', 400: '#ff7a5c',
  500: '#ff5a36', 600: '#f04a26', 700: '#c7391c', 800: '#9e2e19', 900: '#7a2412', 950: '#421006',
};
const ink = {
  50: '#f4f0e8', 100: '#e8e3da', 200: '#d8d3c9', 300: '#bfbab0', 400: '#a5a097', 500: '#85807a',
  600: '#57544f', 700: '#3a3835', 800: '#1d1d20', 900: '#151517', 950: '#0a0a0b',
};

module.exports = {
  content: ['./index.html', './src/js/**/*.js'],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        blue: ember, indigo: ember, purple: ember, sky: ember,
        gray: ink, slate: ink, zinc: ink, neutral: ink,
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
};

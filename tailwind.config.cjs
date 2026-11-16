/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

module.exports = {
  content: ['./index.html', './src/js/**/*.js'],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      // One accent colour: every indigo-* and purple-* utility in the markup renders as blue.
      colors: { indigo: colors.blue, purple: colors.blue },
    },
  },
};

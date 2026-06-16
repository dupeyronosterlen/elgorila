/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './boletos.html',
    './checkout.html',
    './confirmacion.html',
    './gracias.html',
    './js/main.js',
    './js/checkout.js',
    './js/confirmacion.js',
    './js/invitacion-boletos.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#D43A1A',
        'background-light': '#F5F5DC',
        'background-dark': '#0a0706',
        'text-light': '#333333',
        'text-dark': '#f1ead9',
        'text-muted-dark': 'rgba(241,234,217,.88)',
        'accent-gold': '#d99b3a',
        'rich-dark': '#120d0b',
        'deep-forest': '#1e2a1e',
        granate: '#6B2D35',
        'accent-green-dark': '#346F63',
        'accent-maroon-dark': '#A6365F',
      },
      fontFamily: {
        display: ["'Cormorant Garamond'", 'Georgia', 'serif'],
        body: ["'EB Garamond'", 'Georgia', 'serif'],
        serif: ["'Cormorant Garamond'", 'Georgia', 'serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#08080a',
          card: '#121216',
          panel: '#16161c',
          border: '#23232c'
        },
        cinemaGold: {
          light: '#f5d061',
          DEFAULT: '#d4af37', // Premium cinematic gold
          dark: '#b28f24',
          glow: 'rgba(212, 175, 55, 0.15)'
        },
        cinemaCharcoal: {
          light: '#2a2a35',
          DEFAULT: '#1c1c24',
          dark: '#111116'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif']
      },
      boxShadow: {
        'premium-glow': '0 0 25px rgba(212, 175, 55, 0.12)',
        'card-glow': '0 10px 30px -15px rgba(0, 0, 0, 0.7)',
        'modal': '0 30px 60px -15px rgba(0, 0, 0, 0.9)'
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(to top, #08080a 0%, rgba(8, 8, 10, 0.7) 40%, rgba(8, 8, 10, 0) 100%)',
        'banner-overlay': 'linear-gradient(to right, #08080a 0%, rgba(8, 8, 10, 0.95) 30%, rgba(8, 8, 10, 0.8) 50%, rgba(8, 8, 10, 0.2) 100%)'
      }
    },
  },
  plugins: [],
}

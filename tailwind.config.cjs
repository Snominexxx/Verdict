/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'Gill Sans', 'Segoe UI', 'sans-serif'],
        body: ['Inter', 'Segoe UI', 'sans-serif']
      },
      colors: {
        // Surfaces
        ink: '#020617',          /* Slate 950 — primary background */
        dusk: '#0f172a',         /* Slate 900 — secondary background */

        // Brand accent — cool blue tuned to the site's slate palette
        accent: {
          DEFAULT: '#7dd3fc',
          hover: '#bae6fd',
          muted: '#38bdf8',
          soft: 'rgba(125, 211, 252, 0.15)'
        },

        // Legacy tokens
        flare: '#ffffff',
        pulse: '#94a3b8',
        amber: '#cbd5e1'
      },
      textColor: {
        // Semantic text scale — use these instead of white/40, white/50 etc.
        primary: '#ffffff',
        secondary: 'rgba(255, 255, 255, 0.78)',
        muted: 'rgba(255, 255, 255, 0.55)'
      },
      borderColor: {
        subtle: 'rgba(255, 255, 255, 0.08)',
        strong: 'rgba(255, 255, 255, 0.18)'
      },
      backgroundColor: {
        card: 'rgba(255, 255, 255, 0.03)',
        'card-hover': 'rgba(255, 255, 255, 0.06)'
      },
      backgroundImage: {
        'circuit-glow':
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)'
      },
      boxShadow: {
        card: '0 20px 60px rgba(12, 5, 29, 0.45)',
        accent: '0 8px 24px rgba(56, 189, 248, 0.25)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};

module.exports = config;


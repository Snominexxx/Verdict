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
        ink: '#020617',  /* Slate 950 - Professional deeply dark blue/black */
        dusk: '#0f172a', /* Slate 900 - Secondary dark */
        flare: '#ffffff',
        pulse: '#94a3b8', /* Slate 400 */
        amber: '#cbd5e1'  /* Slate 300 */
      },
      backgroundImage: {
        'circuit-glow':
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)'
      },
      boxShadow: {
        card: '0 20px 60px rgba(12, 5, 29, 0.45)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};

module.exports = config;


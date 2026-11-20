/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050B18',
          900: '#0B1629',
          800: '#101F36',
          700: '#152641',
        },
        gold: {
          300: '#F9D68C',
          400: '#F5BD45',
          500: '#E5A82E',
          600: '#C98F1F',
        },
        orange: {
          brand: '#FF762E',
        },
        txt: {
          primary: '#FFFFFF',
          secondary: '#AAB6C8',
          muted: '#718096',
        },
        correct: '#22C55E',
        livered: '#FF3B30',
        upcoming: '#6B7A99',
      },
      fontFamily: {
        display: ['Barlow Condensed', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'stadium-dark':
          'radial-gradient(1200px 500px at 50% -10%, rgba(245,189,69,0.14), transparent 60%), radial-gradient(900px 400px at 85% 10%, rgba(255,118,46,0.10), transparent 55%), linear-gradient(180deg, #0B1629 0%, #050B18 100%)',
        'card-sheen':
          'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 40%), linear-gradient(180deg, #101F36 0%, #0C1A2F 100%)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(245,189,69,0.35)',
        'glow-soft': '0 0 16px rgba(245,189,69,0.18)',
        card: '0 8px 32px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};

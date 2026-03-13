/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        tato: {
          base: '#030a16',
          panel: '#09172d',
          panelSoft: '#12243f',
          line: '#1c3358',
          text: '#edf4ff',
          muted: '#8ea4c8',
          dim: '#64779c',
          accent: '#1e6dff',
          accentStrong: '#1556d6',
          profit: '#1ec995',
          warn: '#f5b942',
          error: '#ff8f8f',
          surface: '#172338',
          hover: '#1a3158',
          cardOverlay: 'rgba(0,0,0,0.58)',
        },
      },
      borderRadius: {
        card: '30px',
      },
      fontFamily: {
        sans: ['Inter_400Regular', 'Inter', 'System'],
        'sans-medium': ['Inter_500Medium', 'Inter', 'System'],
        'sans-semibold': ['Inter_600SemiBold', 'Inter', 'System'],
        'sans-bold': ['Inter_700Bold', 'Inter', 'System'],
        mono: ['SpaceMono'],
      },
    },
  },
  plugins: [],
};

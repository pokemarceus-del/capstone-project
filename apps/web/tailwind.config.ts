import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefaf7',
          100: '#d8f5ee',
          500: '#2aa876',
          600: '#1d8f63',
          700: '#0f6f4d',
        },
      },
    },
  },
  plugins: [],
};

export default config;

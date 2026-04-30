import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        cream: {
          50: '#fdf9f3',
          100: '#faf3e7',
          200: '#f5e6cf',
        },
        blush: {
          50: '#fdf2f5',
          100: '#fbe5ec',
          200: '#f7ccd9',
        },
        mist: {
          50: '#f0f5fb',
          100: '#e1ebf7',
          200: '#c3d7ef',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;

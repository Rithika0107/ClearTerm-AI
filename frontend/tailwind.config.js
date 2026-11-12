/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#003087',      // Deep PayPal Navy
          primary: '#0070E0',   // Primary Blue
          secondary: '#1546A0', // Secondary Blue
          light: '#EAF3FF',     // Light Blue Accent
          bg: '#F5F8FC',        // Clean fintech light bg
          text: '#172B4D',      // Primary Text
          muted: '#64748B',     // Secondary Text
          success: '#159B72',   // Verified Green
          warning: '#F5A623',   // Review Amber
          danger: '#D93036',    // Mismatch Red
        },
        dark: {
          bg: '#101827',        // Dark Mode Background
          surface: '#17243A',   // Secondary Background
          card: '#1D2B42',      // Card Background
          text: '#F1F5F9',      // Primary Text
          muted: '#A9B7CA',     // Secondary Text
          accent: '#4B9BFF',    // Accent Blue
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'fintech': '0 1px 3px 0 rgba(0, 48, 135, 0.05), 0 1px 2px 0 rgba(0, 48, 135, 0.03)',
        'fintech-md': '0 4px 6px -1px rgba(0, 48, 135, 0.07), 0 2px 4px -1px rgba(0, 48, 135, 0.04)',
        'fintech-lg': '0 10px 15px -3px rgba(0, 48, 135, 0.08), 0 4px 6px -2px rgba(0, 48, 135, 0.04)',
      }
    },
  },
  plugins: [],
}

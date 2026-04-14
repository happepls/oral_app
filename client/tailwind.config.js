/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        // Brand (design-tokens.json)
        "primary":       "#637FF1",
        "primary-light": "#c3cef8",
        "primary-dark":  "#2d44ca",
        "secondary":     "#a47af6",
        // Semantic
        "success":  "#10B981",
        "warning":  "#F59E0B",
        "error":    "#e2412e",
        // Surfaces
        "background-light": "#f6f7f8",
        "background-dark":  "#101922",
      },
      fontFamily: {
        "display": ["Lexend", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.625rem",
        "sm":   "0.625rem",  /* 10px */
        "md":   "0.8125rem", /* 13px */
        "lg":   "1.25rem",   /* 20px */
        "xl":   "1.8125rem", /* 29px */
        "2xl":  "1.5rem",
        "3xl":  "2rem",
        "full": "9999px"
      },
      boxShadow: {
        "brand": "0 10px 23px rgba(137,171,241,0.18)",
        "brand-lg": "0 16px 32px rgba(137,171,241,0.24)",
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}


/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        lichen: "#E9EEEA",      // page background
        paper: "#F8FAF8",       // panels
        canopy: "#173A2B",      // ink and headings
        moss: "#4E6B5C",        // secondary text
        leaf: "#2F7D4F",        // Verified, main actions
        amberleaf: "#A86512",   // Needs review
        ember: "#B4233A",       // Not eligible, frozen
        river: "#2F55A4",       // Already claimed
        mist: "#647487",        // Can't check yet
        line: "#C9D4CD",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        body: ['"Atkinson Hyperlegible"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

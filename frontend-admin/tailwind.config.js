/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        ember: "#f97316",
        mist: "#dbe4ff",
        panel: "#111827",
      },
      boxShadow: {
        glow: "0 20px 45px rgba(249,115,22,0.18)",
      },
    },
  },
  plugins: [],
};
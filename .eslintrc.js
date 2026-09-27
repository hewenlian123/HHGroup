const fs = require("fs");
const path = require("path");

const enforced = fs
  .readFileSync(path.join(__dirname, "scripts/raw-color-enforced.txt"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && /\.tsx?$/.test(line));

module.exports = {
  extends: ["next/core-web-vitals", "next/typescript", "prettier"],
  plugins: ["hh"],
  overrides: [
    {
      files: ["src/**/*.{ts,tsx}"],
      rules: {
        "hh/no-raw-color": "warn",
      },
    },
    {
      files: enforced,
      rules: {
        "hh/no-raw-color": "error",
      },
    },
  ],
};

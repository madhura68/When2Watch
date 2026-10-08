// Renders the PWA/favicon PNGs from the two icon SVGs with sharp (already a Next dependency).
import sharp from "sharp";
import { readFileSync } from "node:fs";
const plain = readFileSync("public/icons/when2watch-scherm.svg"), maskable = readFileSync("public/icons/when2watch-scherm-maskable.svg");
const jobs = [["icon-192.png", plain, 192], ["icon-512.png", plain, 512], ["icon-maskable-192.png", maskable, 192], ["icon-maskable-512.png", maskable, 512],
  ["apple-touch-icon-180.png", plain, 180], ["favicon-32.png", plain, 32], ["favicon-16.png", plain, 16]];
for (const [name, svg, size] of jobs) {
  await sharp(svg, { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`public/icons/${name}`);
  console.log(name, size);
}

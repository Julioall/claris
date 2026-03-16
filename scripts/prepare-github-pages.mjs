import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");
const notFoundPath = path.join(distDir, "404.html");
const noJekyllPath = path.join(distDir, ".nojekyll");

await copyFile(indexPath, notFoundPath);
await writeFile(noJekyllPath, "", "utf8");

console.log("GitHub Pages artifacts prepared in dist/.");
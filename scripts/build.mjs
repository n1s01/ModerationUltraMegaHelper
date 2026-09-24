import { mkdir, readFile, writeFile } from "node:fs/promises";
import { minify } from "terser";

const sourcePath = "ModerationUltraMegaHelper.user.js";
const outputPath = "dist/ModerationUltraMegaHelper.min.user.js";
const source = await readFile(sourcePath, "utf8");
const headerEndMarker = "// ==/UserScript==";
const headerEnd = source.indexOf(headerEndMarker);

if (!source.startsWith("// ==UserScript==\n") || headerEnd === -1) {
  throw new Error("Не найден заголовок userscript");
}

const header = source.slice(0, headerEnd + headerEndMarker.length);
const body = source.slice(headerEnd + headerEndMarker.length).trim();
const result = await minify(body, {
  compress: { passes: 2 },
  mangle: true,
  format: { comments: false }
});

if (!result.code) {
  throw new Error("Минификация вернула пустой скрипт");
}

await mkdir("dist", { recursive: true });
await writeFile(outputPath, `${header}\n\n${result.code}\n`);

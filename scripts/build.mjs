import { mkdir, readFile, writeFile } from "node:fs/promises";
import { transform } from "esbuild";

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
const result = await transform(body, {
  loader: "js",
  minify: true,
  charset: "utf8",
  legalComments: "none",
  target: "es2020"
});

if (!result.code) {
  throw new Error("Минификация вернула пустой скрипт");
}

await mkdir("dist", { recursive: true });
await writeFile(outputPath, `${header}\n\n${result.code.trimEnd()}\n`);

import fs from "node:fs";
import path from "node:path";
import { groupInventoryLines, readInventoryCardLines } from "./yugioh_inventory_common.mjs";

const cwd = process.cwd();
const inputPath = path.join(cwd, "artifacts", "yugioh_raw_inventory.txt");
const outputPath = path.join(cwd, "artifacts", "yugioh_normalized_inventory.json");
const ambiguitiesPath = path.join(cwd, "artifacts", "yugioh_normalized_inventory_ambiguities.md");

const cardLines = readInventoryCardLines(inputPath);
const { result, ambiguities: ambiguityEntries } = groupInventoryLines(cardLines);
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");

const ambiguitiesContent = [
  "# Ambigüedades de normalización",
  "",
  ...ambiguityEntries.map((entry) => `- ${entry}`),
  "",
  "- Gate Guardian y Meteor B. Dragon conservan name_jp explícito porque el texto incluía la escritura japonesa.",
  "- Necroface y Succession of Soul figuraban como cartas en japonés, pero sin cadena japonesa explícita; se dejó name_jp en null.",
].join("\n");
fs.writeFileSync(ambiguitiesPath, ambiguitiesContent + "\n");

const summary = {
  totalEntries: cardLines.length,
  uniqueCards: result.length,
  duplicates: result.filter((item) => item.quantity > 1).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
  jpCards: result.filter((item) => item.name_jp),
};

console.log(JSON.stringify(summary, null, 2));

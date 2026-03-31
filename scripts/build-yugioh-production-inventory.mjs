import fs from "node:fs";
import path from "node:path";
import "../backend/src/lib/load-env.js";
import prismaPkg from "@prisma/client";
import {
  catalogKey,
  groupInventoryLines,
  readInventoryCardLines,
} from "../artifacts/yugioh_inventory_common.mjs";

const { PrismaClient } = prismaPkg;

const prisma = new PrismaClient();
const cwd = process.cwd();
const inputPath = path.join(cwd, "artifacts", "yugioh_raw_inventory.txt");
const finalInventoryPath = path.join(cwd, "artifacts", "yugioh_inventory_final_card_ids.json");
const reportPath = path.join(cwd, "artifacts", "yugioh_inventory_production_report.json");
const sqlPath = path.join(cwd, "artifacts", "yugioh_inventory_card_stock_updates.sql");
const DEFAULT_CATALOG_SCOPE_LIMIT = 500;

function getLowStockThreshold(quantity) {
  const parsed = Math.max(0, Math.floor(Number(quantity) || 0));
  return parsed > 1 ? parsed - 1 : 0;
}

function escapeSqlString(value) {
  return String(value || "").replace(/'/g, "''");
}

function createBigramSet(value) {
  const normalized = ` ${String(value || "")} `;
  const result = new Set();

  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }

  return result;
}

function tokenize(value) {
  return catalogKey(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function diceCoefficient(left, right) {
  if (!left.size || !right.size) {
    return 0;
  }

  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let overlap = 0;

  for (const entry of smaller) {
    if (larger.has(entry)) {
      overlap += 1;
    }
  }

  return (2 * overlap) / (left.size + right.size);
}

function jaccardSimilarity(leftTokens, rightTokens) {
  if (!leftTokens.length || !rightTokens.length) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let overlap = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  return union ? overlap / union : 0;
}

function similarityScore(sourceRecord, catalogRecord) {
  if (sourceRecord.key === catalogRecord.key) {
    return 1;
  }

  const dice = diceCoefficient(sourceRecord.bigrams, catalogRecord.bigrams);
  const jaccard = jaccardSimilarity(sourceRecord.tokens, catalogRecord.tokens);
  let score = (dice * 0.8) + (jaccard * 0.2);

  if (sourceRecord.key.startsWith(catalogRecord.key) || catalogRecord.key.startsWith(sourceRecord.key)) {
    score += 0.03;
  }

  if (sourceRecord.tokens[0] && sourceRecord.tokens[0] === catalogRecord.tokens[0]) {
    score += 0.02;
  }

  return Math.min(score, 0.999);
}

function makeSourceRecord(entry) {
  const key = catalogKey(entry.name);
  return {
    ...entry,
    key,
    tokens: tokenize(entry.name),
    bigrams: createBigramSet(key),
  };
}

function makeCatalogRecord(name, cards) {
  const key = catalogKey(name);
  return {
    name,
    cards,
    key,
    tokens: tokenize(name),
    bigrams: createBigramSet(key),
  };
}

function sortCandidates(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return left.name.localeCompare(right.name);
}

function serializeCandidate(record, score = 1) {
  return {
    name: record.name,
    cardIds: record.cards.map((card) => card.id).sort((left, right) => left - right),
    score: Number(score.toFixed(4)),
  };
}

function resolveMatch(sourceRecord, byName, byKey, catalogRecords) {
  const exactByName = byName.get(sourceRecord.name);
  if (exactByName) {
    if (exactByName.cards.length === 1) {
      return {
        status: "matched",
        matchType: "exact",
        card: exactByName.cards[0],
        candidates: [serializeCandidate(exactByName)],
      };
    }

    return {
      status: "duplicate-conflict",
      reason: "catalog-name-not-unique",
      candidates: [serializeCandidate(exactByName)],
    };
  }

  const exactByKey = byKey.get(sourceRecord.key);
  if (exactByKey?.length === 1) {
    const candidate = exactByKey[0];
    if (candidate.cards.length === 1) {
      return {
        status: "matched",
        matchType: "catalog-key",
        card: candidate.cards[0],
        candidates: [serializeCandidate(candidate)],
      };
    }

    return {
      status: "duplicate-conflict",
      reason: "catalog-key-not-unique",
      candidates: [serializeCandidate(candidate)],
    };
  }

  if (exactByKey?.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple-catalog-key-candidates",
      candidates: exactByKey.map((candidate) => serializeCandidate(candidate)).sort(sortCandidates),
    };
  }

  const scoredCandidates = catalogRecords
    .map((candidate) => ({ candidate, score: similarityScore(sourceRecord, candidate) }))
    .filter((entry) => entry.score >= 0.82)
    .sort((left, right) => sortCandidates(
      { name: left.candidate.name, score: left.score },
      { name: right.candidate.name, score: right.score },
    ))
    .slice(0, 5);

  if (!scoredCandidates.length) {
    return {
      status: "unmatched",
      reason: "no-candidates",
      candidates: [],
    };
  }

  const [bestCandidate, secondCandidate] = scoredCandidates;
  if (
    bestCandidate.score >= 0.985 &&
    bestCandidate.candidate.cards.length === 1 &&
    (!secondCandidate || bestCandidate.score - secondCandidate.score >= 0.02)
  ) {
    return {
      status: "matched",
      matchType: "fuzzy",
      card: bestCandidate.candidate.cards[0],
      candidates: scoredCandidates.map((entry) => serializeCandidate(entry.candidate, entry.score)),
    };
  }

  const reason = bestCandidate.candidate.cards.length > 1 ? "fuzzy-candidate-not-unique" : "fuzzy-review-required";
  return {
    status: bestCandidate.candidate.cards.length > 1 ? "duplicate-conflict" : "ambiguous",
    reason,
    candidates: scoredCandidates.map((entry) => serializeCandidate(entry.candidate, entry.score)),
  };
}

function buildSql(finalInventory) {
  const scopeSelectedCardIds = finalInventory.map((item) => item.cardId).sort((left, right) => left - right);
  const scopeSettingsValues = [
    ["catalog_scope_mode", "SELECTED"],
    ["catalog_scope_limit", String(DEFAULT_CATALOG_SCOPE_LIMIT)],
    ["catalog_scope_selected_ids", JSON.stringify(scopeSelectedCardIds)],
  ].map(([key, value]) => `  ('${escapeSqlString(key)}', '${escapeSqlString(value)}', NOW(), NOW())`).join(",\n");

  if (!finalInventory.length) {
    return [
      "BEGIN;",
      "",
      "UPDATE \"Card\"",
      "SET stock = 0, \"lowStockThreshold\" = 0",
      "WHERE stock <> 0 OR \"lowStockThreshold\" <> 0;",
      "",
      "INSERT INTO \"AppSetting\" (\"key\", \"value\", \"createdAt\", \"updatedAt\")",
      "VALUES",
      scopeSettingsValues,
      "ON CONFLICT (\"key\") DO UPDATE",
      "SET \"value\" = EXCLUDED.\"value\", \"updatedAt\" = NOW();",
      "",
      "COMMIT;",
      "",
    ].join("\n");
  }

  const values = finalInventory
    .map((item) => `  (${item.cardId}, ${item.quantity}, ${getLowStockThreshold(item.quantity)})`)
    .join(",\n");

  return [
    "BEGIN;",
    "",
    "UPDATE \"Card\"",
    "SET stock = 0, \"lowStockThreshold\" = 0",
    "WHERE stock <> 0 OR \"lowStockThreshold\" <> 0;",
    "",
    "UPDATE \"Card\" AS c",
    "SET stock = payload.quantity,",
    "    \"lowStockThreshold\" = payload.low_stock_threshold,",
    "    \"isVisible\" = TRUE",
    "FROM (",
    "VALUES",
    values,
    ") AS payload(id, quantity, low_stock_threshold)",
    "WHERE c.id = payload.id;",
    "",
    "INSERT INTO \"AppSetting\" (\"key\", \"value\", \"createdAt\", \"updatedAt\")",
    "VALUES",
    scopeSettingsValues,
    "ON CONFLICT (\"key\") DO UPDATE",
    "SET \"value\" = EXCLUDED.\"value\", \"updatedAt\" = NOW();",
    "",
    "COMMIT;",
    "",
  ].join("\n");
}

try {
  const cardLines = readInventoryCardLines(inputPath);
  const { result: normalizedInventory, ambiguities: normalizationAmbiguities } = groupInventoryLines(cardLines);
  const sourceRecords = normalizedInventory.map(makeSourceRecord);

  const cards = await prisma.card.findMany({
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const byName = new Map();
  for (const card of cards) {
    const current = byName.get(card.name) || { name: card.name, cards: [] };
    current.cards.push(card);
    byName.set(card.name, current);
  }

  const catalogRecords = [...byName.values()].map((entry) => makeCatalogRecord(entry.name, entry.cards));
  const byKey = new Map();
  for (const record of catalogRecords) {
    const current = byKey.get(record.key) || [];
    current.push(record);
    byKey.set(record.key, current);
  }

  const duplicateCatalogNames = catalogRecords
    .filter((record) => record.cards.length > 1)
    .map((record) => ({
      name: record.name,
      cardIds: record.cards.map((card) => card.id).sort((left, right) => left - right),
    }));

  const matchedCards = [];
  const unmatchedCards = [];
  const ambiguousCards = [];
  const duplicateConflicts = [];

  for (const sourceRecord of sourceRecords) {
    const match = resolveMatch(sourceRecord, byName, byKey, catalogRecords);
    const baseEntry = {
      name: sourceRecord.name,
      quantity: sourceRecord.quantity,
      name_es: sourceRecord.name_es,
      name_jp: sourceRecord.name_jp,
      variants: sourceRecord.variants,
      originalNames: sourceRecord.originalNames,
    };

    if (match.status === "matched") {
      matchedCards.push({
        ...baseEntry,
        cardId: match.card.id,
        dbName: match.card.name,
        matchType: match.matchType,
        candidates: match.candidates,
      });
      continue;
    }

    if (match.status === "duplicate-conflict") {
      duplicateConflicts.push({
        ...baseEntry,
        reason: match.reason,
        candidates: match.candidates,
      });
      continue;
    }

    if (match.status === "ambiguous") {
      ambiguousCards.push({
        ...baseEntry,
        reason: match.reason,
        candidates: match.candidates,
      });
      continue;
    }

    unmatchedCards.push({
      ...baseEntry,
      reason: match.reason,
      candidates: match.candidates,
    });
  }

  const finalInventory = matchedCards
    .map((item) => ({
      cardId: item.cardId,
      name: item.dbName,
      quantity: item.quantity,
      lowStockThreshold: getLowStockThreshold(item.quantity),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const duplicateFinalCardIds = finalInventory
    .map((item) => item.cardId)
    .filter((cardId, index, values) => values.indexOf(cardId) !== index)
    .filter((cardId, index, values) => values.indexOf(cardId) === index);

  const duplicateFinalNames = finalInventory
    .map((item) => item.name)
    .filter((name, index, values) => values.indexOf(name) !== index)
    .filter((name, index, values) => values.indexOf(name) === index);

  const topCardsByQuantity = [...sourceRecords]
    .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name))
    .slice(0, 25)
    .map((entry) => {
      const matched = matchedCards.find((item) => item.name === entry.name);
      return {
        name: entry.name,
        quantity: entry.quantity,
        cardId: matched?.cardId || null,
        matchType: matched?.matchType || null,
      };
    });

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      rawEntries: cardLines.length,
      normalizedUniqueCards: sourceRecords.length,
    },
    database: {
      table: "Card",
      totalRows: cards.length,
      stockCardsTableExists: false,
      recommendedTarget: "Card.stock",
      duplicateCatalogNames,
    },
    summary: {
      matched: matchedCards.length,
      exactMatches: matchedCards.filter((item) => item.matchType === "exact").length,
      catalogKeyMatches: matchedCards.filter((item) => item.matchType === "catalog-key").length,
      fuzzyMatches: matchedCards.filter((item) => item.matchType === "fuzzy").length,
      unmatched: unmatchedCards.length,
      ambiguous: ambiguousCards.length,
      duplicateConflicts: duplicateConflicts.length,
    },
    finalInventory,
    matchedCards,
    unmatchedCards,
    ambiguousCards,
    duplicateConflicts,
    topCardsByQuantity,
    validation: {
      allFinalRowsHaveCardId: finalInventory.every((item) => Number.isInteger(item.cardId)),
      finalRowsHaveNoNulls: finalInventory.every((item) => item.cardId && item.name && Number.isInteger(item.quantity)),
      duplicateFinalCardIds,
      duplicateFinalNames,
      uniqueFinalRows: duplicateFinalCardIds.length === 0 && duplicateFinalNames.length === 0,
      allNormalizedCardsResolved:
        matchedCards.length === sourceRecords.length &&
        unmatchedCards.length === 0 &&
        ambiguousCards.length === 0 &&
        duplicateConflicts.length === 0,
      unresolvedCards: unmatchedCards.length + ambiguousCards.length + duplicateConflicts.length,
    },
    normalizationAmbiguities,
    performance: {
      finalInventoryBytes: Buffer.byteLength(JSON.stringify(finalInventory)),
      recommendedCacheKey: "catalog:yugioh:inventory:v1",
      recommendedPayload: "artifacts/yugioh_inventory_final_card_ids.json",
    },
  };

  fs.writeFileSync(finalInventoryPath, JSON.stringify(finalInventory, null, 2) + "\n");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(sqlPath, buildSql(finalInventory));

  console.log(JSON.stringify({
    summary: report.summary,
    validation: report.validation,
    paths: {
      finalInventoryPath,
      reportPath,
      sqlPath,
    },
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
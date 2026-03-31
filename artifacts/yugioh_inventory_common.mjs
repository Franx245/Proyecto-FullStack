import fs from "node:fs";

export function asciiKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function catalogKey(value) {
  return asciiKey(value)
    .replace(/["'`´‘’“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const overrides = new Map([
  ["legado del duelista", { name: "Legacy of the Duelist", name_es: "Legado del Duelista", note: "Legado del Duelista venia anotada como 'Duelist Alliance / Duelist Heritage'; se normalizo a Legacy of the Duelist porque es la correspondencia directa del titulo en espanol y existe en el catalogo." }],
  ["dolor de pesadilla", { name: "Nightmare Pain", name_es: "Dolor de Pesadilla" }],
  ["atractivo de la oscuridad", { name: "Allure of Darkness", name_es: "Atractivo de la Oscuridad" }],
  ["cruzado oscuro", { name: "Dark Grepher", name_es: "Cruzado Oscuro" }],
  ["llamada de la momia", { name: "Call of the Mummy", name_es: "Llamada de la Momia" }],
  ["quitar el limitador", { name: "Limiter Removal", name_es: "Quitar el Limitador" }],
  ["soldado judia", { name: "Bean Soldier", name_es: "Soldado Judia" }],
  ["raiza el monarca de las tormentas", { name: "Raiza the Storm Monarch", name_es: "Raiza el Monarca de las Tormentas" }],
  ["drenaje de habilidad", { name: "Skill Drain", name_es: "Drenaje de Habilidad" }],
  ["sabio de azules ojos", { name: "Sage with Eyes of Blue", name_es: "Sabio con Ojos de Azul" }],
  ["geomante de la barrera de hielo", { name: "Geomancer of the Ice Barrier", name_es: "Geomante de la Barrera de Hielo" }],
  ["general raiho de la barrera de hielo", { name: "General Raiho of the Ice Barrier", name_es: "General Raiho de la Barrera de Hielo" }],
  ["dragon borrelfinal", { name: "Borrelend Dragon", name_es: "Dragon Borrelfinal" }],
  ["ejecutor revengamiedo", { name: "Revendread Executor", name_es: "Ejecutor Revengamiedo" }],
  ["vendread executor", { name: "Revendread Executor", name_es: "Ejecutor Revengamiedo" }],
  ["archidemonio enlacemail", { name: "Linkmail Archfiend", name_es: "Archidemonio Enlacemail" }],
  ["espejade el dragon hoja de hielo", { name: "Mirrorjade the Iceblade Dragon", name_es: "Espejade el Dragon Hoja de Hielo" }],
  ["dragon meteoro", { name: "Meteor Dragon", name_es: "Dragon Meteoro" }],
  ["meteor b. dragon", { name: "Meteor Black Dragon", name_es: "Dragon Negro de Meteorito", note: "Meteor B. Dragon se expandio a Meteor Black Dragon porque el nombre en espanol y el nombre japones explicito corresponden a esa carta." }],
  ["meteor b dragon", { name: "Meteor Black Dragon", name_es: "Dragon Negro de Meteorito", note: "Meteor B. Dragon se expandio a Meteor Black Dragon porque el nombre en espanol y el nombre japones explicito corresponden a esa carta." }],
  ["succession of soul", { name: "Successor Soul", name_es: "Sucesion de Almas", note: "Succession of Soul se normalizo a Successor Soul, que es el nombre oficial presente en el catalogo." }],
  ["chatiment du marque", { name: "Punishment of the Branded", name_es: "Castigo del Senalado" }],
  ["perte du marque", { name: "Branded Loss", name_es: "Perdida del Senalado" }],
  ["jugement du marque", { name: "Judgment of the Branded", name_es: "Juicio del Senalado" }],
  ["brigrand le dragon de la gloire", { name: "Brigrand the Glory Dragon", name_es: "Brigrand el Dragon de la Gloria" }],
  ["sprind le dragon filefer", { name: "Sprind the Irondash Dragon", name_es: "Sprind el Dragon de Hierro" }],
  ["dragon estelar majestuoso", { name: "Majestic Star Dragon", name_es: "Dragon Estelar Majestuoso" }],
  ["chica maga oscura, la jinete del dragon", { name: "Dark Magician Girl the Dragon Knight", name_es: "Chica Maga Oscura, la Jinete del Dragon" }],
  ["dragon amuleto", { name: "Amulet Dragon", name_es: "Dragon Amuleto" }],
  ["mago oscuro, el jinete del dragon", { name: "Dark Magician the Dragon Knight", name_es: "Mago Oscuro, el Jinete del Dragon" }],
  ["alto mago ebon", { name: "Ebon High Magician", name_es: "Alto Mago Ebon" }],
  ["zaphion, el senor del tiempo", { name: "Zaphion, the Timelord", name_es: "Zaphion, el Senor del Tiempo" }],
  ["prision dimensional", { name: "Dimensional Prison", name_es: "Prision Dimensional" }],
  ["alanegra - etesian de las dos espadas", { name: "Blackwing - Etesian of Two Swords", name_es: "Alanegra - Etesian de las Dos Espadas" }],
  ["alanegra etesian de las dos espadas", { name: "Blackwing - Etesian of Two Swords", name_es: "Alanegra - Etesian de las Dos Espadas" }],
  ["blackwing - etesian of the two swords", { name: "Blackwing - Etesian of Two Swords", name_es: "Alanegra - Etesian de las Dos Espadas" }],
  ["blackwing etesian of the two swords", { name: "Blackwing - Etesian of Two Swords", name_es: "Alanegra - Etesian de las Dos Espadas" }],
  ["frog the jam", { name: "Slime Toad", name_es: "La Rana", note: "Frog the Jam se normalizo a Slime Toad, que es el nombre oficial usado en el catalogo TCG." }],
  ["guardian sphinx", { name: "Guardian Sphinx", name_es: "Esfinge Guardiana" }],
  ["tyranno superconductor", { name: "Super Conductor Tyranno", name_es: "Superconductor Tiranno" }],
]);

const preferredSpanishByName = new Map([
  ["Sage with Eyes of Blue", "Sabio con Ojos de Azul"],
  ["Dimensional Prison", "Prision Dimensional"],
]);

const spanishWordPattern = /\b(el|la|los|las|de|del|mago|caballero|senor|senora|espiritu|barrera|fuego|viento|agua|tierra|azules|ojos|mundo|voz|prision|tormenta|tormentas|destino|regreso|llamada|retribucion|senalado|fusion|reina|guerrero|calavera|legado|blanco|negro|sombras|oscuro|oscura|esfinge|sucesion|pesadilla|momia|judia|tiranno|hielo)\b/i;
const frenchWordPattern = /\b(le|la|les|du|des|de|marque|dragon|gloire|jugement|perte|chatiment)\b/i;
const japanesePattern = /[\u3040-\u30ff\u3400-\u9fff・ー]/u;

function mainSegment(raw) {
  const firstClose = raw.indexOf(")");
  if (firstClose !== -1) {
    return raw.slice(0, firstClose + 1).trim();
  }
  return raw.trim();
}

function looksSpanish(value) {
  const original = String(value || "");
  if (/[áéíóúñÁÉÍÓÚÑ]/.test(original)) {
    return true;
  }
  return spanishWordPattern.test(asciiKey(original));
}

function looksFrench(value) {
  const original = String(value || "");
  return frenchWordPattern.test(asciiKey(original));
}

function detectNaturalLanguage(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "unknown";
  }
  if (japanesePattern.test(source)) {
    return "jp";
  }
  if (looksSpanish(source)) {
    return "es";
  }
  if (looksFrench(source)) {
    return "fr";
  }
  if (/[A-Za-z]/.test(source)) {
    return "en";
  }
  return "unknown";
}

export function explicitJapanese(raw) {
  const jpMatch = raw.match(/\(([\u3040-\u30ff\u3400-\u9fff・ー\s]+)\)/u);
  return jpMatch ? jpMatch[1].trim() : null;
}

export function detectOriginalLanguage(originalName) {
  const match = String(originalName || "").match(/^(.*?)\s*\((.*)\)$/);
  if (!match) {
    return detectNaturalLanguage(originalName);
  }

  const outerLanguage = detectNaturalLanguage(match[1]);
  const innerLanguage = detectNaturalLanguage(match[2]);

  if (
    outerLanguage !== "unknown" &&
    innerLanguage !== "unknown" &&
    outerLanguage !== innerLanguage
  ) {
    return "mixed";
  }

  return outerLanguage !== "unknown" ? outerLanguage : innerLanguage;
}

export function parseInventoryLine(line) {
  const raw = line.replace(/^\d+\.\s*/, "").trim();
  const originalName = mainSegment(raw);
  const detectedLanguage = detectOriginalLanguage(originalName);
  const nameJp = explicitJapanese(raw);
  const match = originalName.match(/^(.*?)\s*\((.*)\)$/);

  if (!match) {
    const outer = originalName.trim();
    const override = overrides.get(asciiKey(outer));
    return {
      name: override?.name || outer,
      name_es: override?.name_es || null,
      name_jp: nameJp,
      note: override?.note || null,
      originalName,
      detectedLanguage,
    };
  }

  const outer = match[1].trim();
  const inner = match[2].trim();
  const override = overrides.get(asciiKey(outer));
  if (override) {
    return {
      name: override.name,
      name_es: override.name_es || null,
      name_jp: nameJp,
      note: override.note || null,
      originalName,
      detectedLanguage,
    };
  }

  if (looksSpanish(outer) && !looksSpanish(inner)) {
    return { name: inner, name_es: outer, name_jp: nameJp, note: null, originalName, detectedLanguage };
  }

  if (!looksSpanish(outer) && looksSpanish(inner)) {
    return { name: outer, name_es: inner, name_jp: nameJp, note: null, originalName, detectedLanguage };
  }

  return { name: outer, name_es: inner, name_jp: nameJp, note: null, originalName, detectedLanguage };
}

export function readInventoryCardLines(inputPath) {
  const text = fs.readFileSync(inputPath, "utf8");
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.filter((line) => /^\d+\.\s/.test(line));
}

export function groupInventoryLines(cardLines) {
  const grouped = new Map();
  const ambiguitySet = new Set();

  for (const line of cardLines) {
    const parsed = parseInventoryLine(line);
    const current = grouped.get(parsed.name) || {
      name: parsed.name,
      name_es: parsed.name_es || null,
      name_jp: parsed.name_jp || null,
      quantity: 0,
      variants: [],
      originalNames: [],
    };

    current.quantity += 1;
    if (!current.name_es && parsed.name_es) {
      current.name_es = parsed.name_es;
    }
    if (!current.name_jp && parsed.name_jp) {
      current.name_jp = parsed.name_jp;
    }

    const variant = current.variants.find((item) => item.originalName === parsed.originalName);
    if (variant) {
      variant.count += 1;
    } else {
      current.variants.push({
        originalName: parsed.originalName,
        detectedLanguage: parsed.detectedLanguage,
        count: 1,
      });
    }

    if (!current.originalNames.includes(parsed.originalName)) {
      current.originalNames.push(parsed.originalName);
    }

    if (preferredSpanishByName.has(current.name)) {
      current.name_es = preferredSpanishByName.get(current.name);
    }

    grouped.set(parsed.name, current);

    if (parsed.note) {
      ambiguitySet.add(parsed.note);
    }
  }

  const result = [...grouped.values()]
    .map((item) => ({
      ...item,
      variants: item.variants.sort((left, right) => right.count - left.count || left.originalName.localeCompare(right.originalName)),
      originalNames: item.originalNames.sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    result,
    ambiguities: [...ambiguitySet].sort((left, right) => left.localeCompare(right)),
  };
}
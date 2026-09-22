const express = require("express");
const { NAME_DB } = require("../names-data");

const router = express.Router();

// GET /api/names — full name library (frontend does its own search/filter over this)
router.get("/", (req, res) => {
  res.json({ names: NAME_DB, pricePerName: 20000, currency: "NGN" });
});

// GET /api/names/lookup?name=... — for names NOT in our curated library,
// search the web (Wikipedia, no API key required) for the Arabic script
// and meaning, so customers rarely have to type these in by hand.
//
// This is a *suggestion*, not a guarantee: the result is always handed
// back to the customer to review/edit before it's added to the cart,
// because it gets calligraphed onto a physical product exactly as
// entered — a wrong Arabic spelling from an automated source is a real
// cost (a ruined frame), so a human check-before-print step stays in
// the loop by design.
router.get("/lookup", async (req, res) => {
  const name = String(req.query.name || "").trim();
  if (!name) return res.status(400).json({ error: "missing_name" });

  // 1. Check our own curated library first — most accurate, no network call.
  const local = NAME_DB.find((n) => n.name.toLowerCase() === name.toLowerCase());
  if (local) {
    return res.json({
      source: "library",
      sourceLabel: "CR-Frames library",
      arabic: local.arabic,
      meaning: local.meaning,
    });
  }

  // 2. Fall back to a web search (Wikipedia's public API, no key needed).
  try {
    const result = await lookupNameOnWikipedia(name);
    if (!result) return res.json({ source: "none" });
    res.json({ source: "web", sourceLabel: "Wikipedia", ...result });
  } catch (err) {
    res.status(502).json({ error: "lookup_failed", message: err.message });
  }
});

async function wikiFetch(url) {
  const resp = await fetch(url, { headers: { "User-Agent": "CR-Frames/1.0 (name lookup)" } });
  if (!resp.ok) return null;
  return resp.json();
}

async function lookupNameOnWikipedia(name) {
  // Try the common "<Name> (name)" article pattern first.
  let page = await wikiFetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name + " (name)")}`
  );

  // Fall back to a general search if that exact title doesn't exist.
  if (!page || page.type === "disambiguation") {
    const searchData = await wikiFetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        name + " Arabic name meaning"
      )}&format=json&origin=*`
    );
    const firstTitle = searchData && searchData.query && searchData.query.search && searchData.query.search[0]
      ? searchData.query.search[0].title
      : null;
    if (!firstTitle) return null;
    page = await wikiFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`);
  }

  if (!page || !page.extract) return null;

  return {
    meaning: extractMeaning(page.extract),
    arabic: extractArabicScript(page.extract) || extractArabicScript(page.title),
    sourceUrl: page.content_urls && page.content_urls.desktop ? page.content_urls.desktop.page : null,
  };
}

// Pull a short "meaning" out of a Wikipedia summary, e.g.
// '...is an Arabic name meaning "night".' -> 'Night'
function extractMeaning(extract) {
  const meansMatch = extract.match(/means?\s+"([^"]+)"/i) || extract.match(/meaning\s+"([^"]+)"/i);
  if (meansMatch) return capitalize(meansMatch[1]);
  // fall back to the first sentence, trimmed to a reasonable length
  const firstSentence = extract.split(/(?<=[.!?])\s/)[0] || extract;
  return firstSentence.length > 160 ? firstSentence.slice(0, 157).trim() + "…" : firstSentence.trim();
}

// Pull contiguous Arabic-script characters out of a string, if present.
function extractArabicScript(text) {
  if (!text) return null;
  const match = text.match(/[\u0600-\u06FF][\u0600-\u06FF\s]*[\u0600-\u06FF]/);
  return match ? match[0].trim() : null;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = router;

// Reads a project's SOW from the description of its "SOW scope" task, so any project with a written scope works.
// Expected shape (what seed.py writes, and what a PM would paste):
//   <p>Signed SOW, fixed fee $48,000, 320 hours. In scope:</p>
//   <ul><li>first in-scope item</li>...</ul>
//   <p>Out of scope: returns portal, loyalty data, ...</p>
// keys: optional names for the in-scope items, in order. Without them items are item_1, item_2, ...

const text = (html) =>
  String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseSow = (html, { project, keys } = {}) => {
  const items = [...String(html || "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1])).filter(Boolean);
  const inScope = {};
  items.forEach((item, i) => {
    inScope[(keys && keys[i]) || `item_${i + 1}`] = item;
  });

  const paragraphs = [...String(html || "").matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => text(m[1]));
  const outLine = paragraphs.find((p) => /^out of scope\s*:/i.test(p)) || "";
  const outOfScope = outLine
    .replace(/^out of scope\s*:/i, "")
    .split(/,|;/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  const contract = (paragraphs.find((p) => !/^out of scope/i.test(p)) || "").replace(/\s*in scope\s*:\s*$/i, "");

  return { project: project || "", contract, inScope, outOfScope };
};

module.exports = { parseSow };

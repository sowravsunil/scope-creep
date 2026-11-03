// Pulls the separate asks out of a pasted conversation (chat, email, call note, signal) so each can be logged as a
// request. This is a writing job, so it uses a general model (Claude Haiku via OpenRouter); deciding what each ask
// is stays with Jev in core/decide.js. The writer is held to the customer's words: every ask must quote the message,
// and an ask whose quote isn't actually in the message is dropped, checked in code.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-5.5";

const SYSTEM = `You turn a message from a customer conversation into separate requests for a services team.

For each distinct thing the customer asks the team to do, change or answer, return:
- title: at most 8 words, in the customer's own terms, no ticket jargon
- summary: one neutral sentence saying what is being asked. Don't judge whether it's in scope or how big it is.
- quote: the customer's exact words that ask for it, copied character for character from the message. Use the
  shortest span that still contains the whole ask.

Ignore greetings, thanks, sign-offs and FYIs that ask for nothing. If nothing is asked, return an empty list.
Never invent details that aren't in the message.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["asks"],
  properties: {
    asks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "quote"],
        properties: { title: { type: "string" }, summary: { type: "string" }, quote: { type: "string" } },
      },
    },
  },
};

// Compare text the way a reader would: case, curly quotes and spacing don't matter; the words do.
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,!?;:-]+|[\s"'.,!?;:-]+$/g, "")
    .trim();

const quoteIsReal = (quote, text) => norm(quote).length >= 4 && norm(text).includes(norm(quote));

// When the writer is unavailable, the PM still gets one editable draft: first line as the title, the text as is.
const fallback = (text) => {
  const first = String(text).trim().split(/\n|(?<=[.?!])\s/)[0] || "New request";
  return [{ title: first.length > 70 ? first.slice(0, 67) + "..." : first, summary: "", quote: String(text).trim() }];
};

const extractAsks = async (apiKey, { text, source, project, model = MODEL }) => {
  if (!apiKey) throw new Error("OpenRouter key is not set, so the request can't be drafted.");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Project: ${project || "unknown"}\nWhere it came from: ${source || "unknown"}\n\nMessage:\n${text}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "asks", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Drafting model ${res.status}: ${raw.slice(0, 200)}`);
  const json = JSON.parse(raw);
  const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  const asks = (JSON.parse(content || "{}").asks || []).map((a) => ({
    title: String(a.title || "").trim().slice(0, 80),
    summary: String(a.summary || "").trim(),
    quote: String(a.quote || "").trim(),
  }));
  const kept = asks.filter((a) => a.title && quoteIsReal(a.quote, text));
  const dropped = asks
    .filter((a) => !kept.includes(a))
    .map((a) => ({ ...a, reason: a.title ? "its quoted words aren't in the message" : "no title" }));
  return { asks: kept, dropped, model: json.model || model, cost: json.usage && json.usage.cost };
};

module.exports = { MODEL, extractAsks, fallback, quoteIsReal };

// Asks Jev (TypeSafe's decision model, via OpenRouter's Decisions API) what a customer request is.
// Shared by the eval script and the Rocketlane app, so both judge requests the same way.
// Jev returns typed answers with probabilities, not text: https://openrouter.ai/docs/guides/community/jev.md

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
// Pinned so thresholds tuned in the eval stay valid. Change it and re-run the eval.
const MODEL = "typesafe/jev-1.14";

const KINDS = {
  in_scope:
    "Work, a question, or a schedule change that the SOW's in-scope list already covers. Includes questions about how delivered work will behave and small adjustments inside an in-scope item.",
  change_request:
    "Asks for new work, more of something, or a different deliverable than the in-scope list describes. Includes anything on the out-of-scope list and anything beyond the stated quantities.",
  blocker:
    "Reports something broken, missing or not approved that stops the project team or the customer from making progress right now.",
  noise: "Asks for nothing: thanks, greetings, introductions, out-of-office notes or FYIs.",
};

// Picked from the eval (eval/RESULTS.md): at 0.6 both runs auto-handled 44/48 with no mistakes; at 0.5 one
// false change request slipped through when its confidence moved from 0.49 to 0.52 between runs.
// The review signal didn't separate clear from ambiguous requests well, so it isn't part of the gate (1.01 = off).
const THRESHOLDS = { minConfidence: 0.6, maxReview: 1.01 };

// Size ranges, smallest first. "Under 1 hour" exists because that's where partners put the free-vs-charged line
// (30 minutes to 2 hours for simple config); the old smallest range, "under 4 hours", couldn't tell that apart.
// hours: a rough midpoint used to prefill the PM's estimate. The PM sets the real number.
const SIZE_RANGES = [
  { key: "under_1", label: "Under 1 hour", short: "Under 1h", hours: 0.5 },
  { key: "1_4", label: "1 to 4 hours", short: "1-4h", hours: 2 },
  { key: "4_16", label: "4 to 16 hours", short: "4-16h", hours: 10 },
  { key: "16_40", label: "16 to 40 hours", short: "16-40h", hours: 28 },
  { key: "over_40", label: "Over 40 hours", short: "Over 40h", hours: 40 },
];
const SIZES = SIZE_RANGES.map((s) => s.label);
const SIZE_KEYS = SIZE_RANGES.map((s) => s.key);

const buildQuestions = (sow) => ({
  kind: {
    type: "choice",
    instructions: "What kind of request is this, judged against the signed SOW in state?",
    criteria: KINDS,
  },
  sow_item: {
    type: "choice",
    instructions: "Which in-scope SOW item is this request about?",
    criteria: { ...sow.inScope, none: "None of the in-scope items: something the SOW doesn't cover at all." },
  },
  size: {
    type: "score",
    instructions: "If this were done as extra work, roughly how much effort would it take?",
    criteria: SIZES,
  },
  needs_review: {
    type: "noul",
    instructions: "Does a delivery manager need to make a judgment call or ask for more detail before acting on this?",
    criteria: {
      true: "It's unclear whether the SOW covers it, it mixes several asks, or key details are missing.",
      false: "It's clear what is being asked and whether the SOW covers it.",
    },
  },
});

const buildRequest = (sow, request) => ({
  model: MODEL,
  state: {
    project: sow.project,
    contract: sow.contract,
    sow_in_scope: Object.values(sow.inScope),
    sow_out_of_scope: sow.outOfScope,
    raised_by: request.raisedBy || "customer",
    request: request.text,
  },
  questions: buildQuestions(sow),
});

// One call. Throws with the status and body on any non-200, so a bad key never looks like an empty answer.
const callJev = async (apiKey, body) => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Jev ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.retryAfterMs = Number(res.headers.get("Retry-After")) * 1000 || undefined;
    throw err;
  }
  const json = JSON.parse(text);
  if (!json.answers || !json.answers.kind || !json.answers.kind.choice) {
    throw new Error(`Jev answer missing 'kind': ${text.slice(0, 300)}`);
  }
  return json;
};

// Turns raw answers into a decision. Acts only when confident and no review is needed.
const interpret = (answers, thresholds) => {
  const { kind, sow_item: sowItem, size, needs_review: review } = answers;
  const sizeIndex = Math.max(0, Math.min(SIZE_KEYS.length - 1, Math.round(size.score)));
  const confident = kind.confidence >= thresholds.minConfidence && review.noul < thresholds.maxReview;
  return {
    kind: kind.choice,
    kindConfidence: kind.confidence,
    kindProbabilities: kind.probabilities,
    sowItem: sowItem.choice,
    sowItemConfidence: sowItem.confidence,
    size: SIZE_KEYS[sizeIndex],
    sizeScore: size.score,
    reviewProbability: review.noul,
    action: confident ? "auto" : "needs_review",
  };
};

module.exports = { MODEL, KINDS, SIZE_KEYS, SIZE_RANGES, THRESHOLDS, buildRequest, callJev, interpret };

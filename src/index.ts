/**
 * ipip-workplace-scorer
 * Zero-dependency public-domain psychometric scoring utilities for:
 * - IPIP-50 Big Five Workplace Assessment (Goldberg, 1992 / ipip.ori.org)
 * - 4-Color Workstyle 2x2 Quadrant Model (trademark-clean educational taxonomy)
 * - Dual-Concern Workplace Conflict Modes (Blake & Mouton, 1964; Rahim, 1983)
 * - Functional Team Roles & Multi-Person Team Chemistry Diagnostics
 * - U.S. DOL O*NET 31.0 Work Style Clusters & Occupational Role Alignment (CC BY 4.0)
 *
 * Non-clinical educational use only.
 * Reference implementations & interactive assessments: https://workplacestylequiz.com
 *
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Shared Types & Constants
// ---------------------------------------------------------------------------

/** Canonical keys for the five Big Five (OCEAN) workplace dimensions. */
export type BigFiveTraitKey =
  | "openness"
  | "conscientiousness"
  | "extraversion"
  | "agreeableness"
  | "emotional-stability";

/** Qualitative score band derived from a 0-100 normalized score. */
export type ScoreBand = "low" | "moderate" | "high";

/** Keying direction for Likert items ("+" = direct scored, "-" = reverse scored). */
export type ItemKeyDirection = "+" | "-";

/** Canonical ordered list of the five Big Five trait keys. */
export const BIG_FIVE_TRAIT_ORDER: readonly BigFiveTraitKey[] = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "emotional-stability",
] as const;

/** Normalized 0-100 score map across all five Big Five dimensions. */
export type BigFiveScores = Record<BigFiveTraitKey, number>;

/** Definition of a single IPIP-style Likert item. */
export interface IpipItem {
  readonly id: string;
  readonly trait: BigFiveTraitKey;
  readonly keyed: ItemKeyDirection;
  readonly ipipFactor: string;
  readonly construct: string;
  readonly statement: string;
}

/** Policy controlling how missing item responses are handled during IPIP scoring. */
export type MissingItemPolicy = "error" | "neutral" | "omit";

/** Options for `scoreIpipItems` and `scoreIpip50`. */
export interface IpipScoringOptions {
  /** Minimum rating on the Likert scale (default: 1). */
  scaleMin?: number;
  /** Maximum rating on the Likert scale (default: 5). */
  scaleMax?: number;
  /** Allow fractional Likert values instead of integers only (default: false). */
  allowDecimals?: boolean;
  /** Policy when expected items are absent from the answers object (default: "error"). */
  missingPolicy?: MissingItemPolicy;
}

/** Trait-level output produced by the IPIP scorer. */
export interface BigFiveTraitResult {
  key: BigFiveTraitKey;
  label: string;
  ipipFactor: string;
  rawScore: number;
  minRaw: number;
  maxRaw: number;
  answeredCount: number;
  totalItems: number;
  score100: number;
  percentile: number;
  band: ScoreBand;
  summary: string;
}

/** Internal response consistency and straight-lining check output. */
export interface ResponseValidityReport {
  status: "high-consistency" | "moderate-variance" | "low-variance-caution";
  consistencyScore: number;
  responseStdDev: number;
  answeredCount: number;
  totalItems: number;
  straightLiningDetected: boolean;
  note: string;
}

/** O*NET 31.0 Work Style cluster score entry. */
export interface OnetWorkStyleClusterMatch {
  id: string;
  name: string;
  onetCategory: string;
  score100: number;
  band: ScoreBand;
  description: string;
}

/** O*NET 31.0 Occupational Role alignment entry. */
export interface OnetRoleMatch {
  slug: string;
  title: string;
  family: string;
  onetCode: string;
  fitScore: number;
  topAlignedTrait: BigFiveTraitKey;
  largestGapTrait: BigFiveTraitKey;
  largestGapPoints: number;
}

/** Full evaluation result returned by `scoreIpipItems` and `scoreIpip50`. */
export interface IpipEvaluationResult {
  dimensions: BigFiveTraitResult[];
  scoresByTrait: BigFiveScores;
  percentilesByTrait: BigFiveScores;
  dominantTrait: BigFiveTraitResult;
  secondaryTrait: BigFiveTraitResult;
  validity: ResponseValidityReport;
  onetClusters: OnetWorkStyleClusterMatch[];
  topRoleMatches: OnetRoleMatch[];
  stretchRoleMatch: OnetRoleMatch;
}

// ---------------------------------------------------------------------------
// Internal Validation & Math Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new TypeError(`${label} must be a non-null plain object.`);
  }
  return value;
}

function assertValidScaleBounds(scaleMin: number, scaleMax: number): void {
  if (!Number.isFinite(scaleMin) || !Number.isFinite(scaleMax) || scaleMax <= scaleMin) {
    throw new RangeError(
      `Invalid Likert scale bounds [${String(scaleMin)}, ${String(scaleMax)}]: scaleMax must exceed scaleMin.`
    );
  }
}

function assertValidLikertRating(
  value: unknown,
  itemId: string,
  scaleMin: number,
  scaleMax: number,
  allowDecimals: boolean
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(
      `Invalid rating for item "${itemId}": expected a finite number between ${scaleMin} and ${scaleMax}.`
    );
  }
  if (!allowDecimals && !Number.isInteger(value)) {
    throw new RangeError(
      `Invalid rating ${value} for item "${itemId}": integer Likert rating required.`
    );
  }
  if (value < scaleMin || value > scaleMax) {
    throw new RangeError(
      `Out-of-range rating ${value} for item "${itemId}": must be between ${scaleMin} and ${scaleMax}.`
    );
  }
  return value;
}

/**
 * Deterministic largest-remainder (Hamilton) percentage allocation so integer buckets
 * always sum strictly to 100.
 */
function largestRemainderPercentages<K extends string>(
  counts: Record<K, number>,
  order: readonly K[]
): Record<K, number> {
  const total = order.reduce((acc, k) => acc + counts[k], 0);
  if (total <= 0) {
    throw new RangeError("Cannot normalize percentages when total count is zero.");
  }

  const shares = order.map((key) => {
    const exact = (counts[key] / total) * 100;
    const floor = Math.floor(exact);
    return { key, floor, remainder: exact - floor };
  });

  let allocated = shares.reduce((acc, s) => acc + s.floor, 0);
  const byRemainder = [...shares].sort((a, b) => {
    const rDiff = b.remainder - a.remainder;
    if (Math.abs(rDiff) > 1e-12) return rDiff;
    return order.indexOf(a.key) - order.indexOf(b.key);
  });

  let idx = 0;
  while (allocated < 100 && idx < byRemainder.length) {
    byRemainder[idx].floor += 1;
    allocated += 1;
    idx += 1;
  }

  const out = {} as Record<K, number>;
  for (const s of shares) {
    out[s.key] = s.floor;
  }
  return out;
}

/**
 * Shared discrete-choice input resolver supporting:
 * 1) Array of valid category IDs: `["crimson", "amber", ...]`
 * 2) Question-to-choice map: `{ q1: "crimson", q2: "slate" }`
 * 3) Pre-aggregated counts map: `{ crimson: 4, amber: 3, sage: 2, slate: 1 }`
 */
function resolveDiscreteCounts<K extends string>(
  input: readonly K[] | Record<string, K> | Partial<Record<K, number>>,
  validKeys: readonly K[],
  label: string
): { counts: Record<K, number>; total: number } {
  const keySet = new Set<string>(validKeys);
  const counts = Object.fromEntries(validKeys.map((k) => [k, 0])) as Record<K, number>;

  if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new RangeError(`${label} array cannot be empty.`);
    }
    for (let i = 0; i < input.length; i += 1) {
      const choice = input[i];
      if (typeof choice !== "string" || !keySet.has(choice)) {
        throw new RangeError(
          `Invalid ${label} choice "${String(choice)}" at index ${i}. Expected one of: ${validKeys.join(", ")}.`
        );
      }
      counts[choice as K] += 1;
    }
    return { counts, total: input.length };
  }

  const record = assertPlainRecord(input, label);
  const entries = Object.entries(record);
  if (entries.length === 0) {
    throw new RangeError(`${label} object cannot be empty.`);
  }

  const looksLikeCountsMap = entries.every(
    ([key, val]) => keySet.has(key) && typeof val === "number"
  );

  if (looksLikeCountsMap) {
    let total = 0;
    for (const [key, val] of entries) {
      if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
        throw new RangeError(
          `Invalid count ${String(val)} for ${label} key "${key}": must be a finite number >= 0.`
        );
      }
      counts[key as K] = val;
      total += val;
    }
    if (total <= 0) {
      throw new RangeError(`${label} counts must sum to greater than 0.`);
    }
    return { counts, total };
  }

  for (const [questionId, choice] of entries) {
    if (typeof choice !== "string" || !keySet.has(choice)) {
      throw new RangeError(
        `Invalid ${label} choice "${String(choice)}" for "${questionId}". Expected one of: ${validKeys.join(", ")}.`
      );
    }
    counts[choice as K] += 1;
  }

  return { counts, total: entries.length };
}

function assertValidBigFiveScores(scores: unknown, label = "scores"): BigFiveScores {
  const rec = assertPlainRecord(scores, label);
  const validated = {} as BigFiveScores;
  for (const trait of BIG_FIVE_TRAIT_ORDER) {
    const val = rec[trait];
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 100) {
      throw new RangeError(
        `Invalid ${label}.${trait} value "${String(val)}": expected a finite number between 0 and 100.`
      );
    }
    validated[trait] = val;
  }
  return validated;
}

// ---------------------------------------------------------------------------
// 1. Public-Domain IPIP-50 Big Five Scorer
// ---------------------------------------------------------------------------

/** Domain descriptions for the five Big Five dimensions. */
export const IPIP50_TRAIT_METADATA: Record<
  BigFiveTraitKey,
  {
    label: string;
    ipipFactor: string;
    highSummary: string;
    moderateSummary: string;
    lowSummary: string;
  }
> = {
  openness: {
    label: "Openness to Experience",
    ipipFactor: "IPIP Factor V (Intellect / Imagination)",
    highSummary:
      "Strong exploratory curiosity, conceptual synthesis, and openness to experimental workflows.",
    moderateSummary:
      "Balances proven operational playbooks with selective experimentation where ROI is clear.",
    lowSummary:
      "Grounded, pragmatic, and focused on concrete execution over abstract speculation.",
  },
  conscientiousness: {
    label: "Conscientiousness",
    ipipFactor: "IPIP Factor III (Orderliness / Dutifulness)",
    highSummary:
      "Disciplined milestone tracking, thorough quality verification, and reliable deadline ownership.",
    moderateSummary:
      "Maintains core structure while adapting smoothly when sprint priorities shift.",
    lowSummary:
      "Flexible, improvisational, and energized by rapid unstructured discovery sprints.",
  },
  extraversion: {
    label: "Extraversion",
    ipipFactor: "IPIP Factor I (Surgency / Social Initiative)",
    highSummary:
      "Draws momentum from live group collaboration, proactive outreach, and vocal alignment.",
    moderateSummary:
      "Switches comfortably between collaborative workshops and focused solo deep work.",
    lowSummary:
      "Reflective deep-worker who excels in written async synthesis and 1:1 trust building.",
  },
  agreeableness: {
    label: "Agreeableness",
    ipipFactor: "IPIP Factor II (Cooperation / Empathy)",
    highSummary:
      "Builds high psychological safety, spots teammate friction early, and bridges silos warmly.",
    moderateSummary:
      "Delivers candid feedback wrapped in constructive, good-faith collaboration.",
    lowSummary:
      "Objective, direct challenger who prioritizes hard logic and firm boundaries over consensus.",
  },
  "emotional-stability": {
    label: "Emotional Stability",
    ipipFactor: "IPIP Factor IV (Inverse Neuroticism / Composure)",
    highSummary:
      "Steady under incident pressure, quick to absorb feedback, and predictable in tense reviews.",
    moderateSummary:
      "Handles routine ambiguity calmly while relying on structured checklists during major crises.",
    lowSummary:
      "Attentive early-warning sensor who detects risk acutely and benefits from clear scope buffers.",
  },
};

/**
 * 50 balanced workplace-adapted Big Five factor markers (10 items per factor; 5 '+' and 5 '-' per factor)
 * grounded in Goldberg's (1992) public-domain IPIP architecture (ipip.ori.org).
 */
export const IPIP50_ITEMS: readonly IpipItem[] = [
  // Factor V: Openness / Intellect (o1 - o10: 5+, 5-)
  { id: "o1", trait: "openness", keyed: "+", ipipFactor: "Factor V", construct: "Intellect", statement: "I enjoy translating ideas from unfamiliar fields into practical work solutions." },
  { id: "o2", trait: "openness", keyed: "-", ipipFactor: "Factor V", construct: "Traditionalism", statement: "I prefer sticking strictly to proven procedures rather than experimenting with new workflows." },
  { id: "o3", trait: "openness", keyed: "+", ipipFactor: "Factor V", construct: "Imagination", statement: "Abstract strategic 'what-if' discussions energize my thinking." },
  { id: "o4", trait: "openness", keyed: "-", ipipFactor: "Factor V", construct: "Concreteness", statement: "Long-horizon conceptual debates without immediate action items quickly lose my interest." },
  { id: "o5", trait: "openness", keyed: "+", ipipFactor: "Factor V", construct: "Curiosity", statement: "When a technical or market shift occurs, I actively research how the underlying system works." },
  { id: "o6", trait: "openness", keyed: "-", ipipFactor: "Factor V", construct: "Routine Comfort", statement: "Changing established team tools mid-quarter feels more disruptive than helpful." },
  { id: "o7", trait: "openness", keyed: "+", ipipFactor: "Factor V", construct: "Synthesis", statement: "I connect messy, disconnected data points into overarching frameworks naturally." },
  { id: "o8", trait: "openness", keyed: "-", ipipFactor: "Factor V", construct: "Practical Focus", statement: "I rarely read outside my primary discipline once I have mastered a dependable skill set." },
  { id: "o9", trait: "openness", keyed: "+", ipipFactor: "Factor V", construct: "Experimentation", statement: "I volunteer early to pilot experimental prototypes or unfamiliar team formats." },
  { id: "o10", trait: "openness", keyed: "-", ipipFactor: "Factor V", construct: "Literalism", statement: "I would rather inspect concrete deliverable checklists than brainstorm open-ended visions." },

  // Factor III: Conscientiousness (c1 - c10: 5+, 5-)
  { id: "c1", trait: "conscientiousness", keyed: "+", ipipFactor: "Factor III", construct: "Orderliness", statement: "I prepare agendas, dependencies, and contingency plans well ahead of critical deadlines." },
  { id: "c2", trait: "conscientiousness", keyed: "-", ipipFactor: "Factor III", construct: "Spontaneity", statement: "I often leave routine documentation or clean-up tasks until someone reminds me." },
  { id: "c3", trait: "conscientiousness", keyed: "+", ipipFactor: "Factor III", construct: "Precision", statement: "I audit edge cases, numbers, and formatting thoroughly before sharing deliverables." },
  { id: "c4", trait: "conscientiousness", keyed: "-", ipipFactor: "Factor III", construct: "Unstructured Pace", statement: "Rigid milestone calendars feel confining; I work best in spontaneous bursts." },
  { id: "c5", trait: "conscientiousness", keyed: "+", ipipFactor: "Factor III", construct: "Follow-Through", statement: "Once I commit to an outcome, I drive every loose thread cleanly across the finish line." },
  { id: "c6", trait: "conscientiousness", keyed: "-", ipipFactor: "Factor III", construct: "Rough Drafting", statement: "I tend to misplace minor action items when juggling several active projects." },
  { id: "c7", trait: "conscientiousness", keyed: "+", ipipFactor: "Factor III", construct: "Dutifulness", statement: "I keep project trackers, status logs, and handoff notes accurately updated." },
  { id: "c8", trait: "conscientiousness", keyed: "-", ipipFactor: "Factor III", construct: "Improvisation", statement: "I prefer figuring out step-by-step details on the fly rather than writing specs upfront." },
  { id: "c9", trait: "conscientiousness", keyed: "+", ipipFactor: "Factor III", construct: "Self-Discipline", statement: "I complete demanding, unglamorous maintenance work promptly without needing external pressure." },
  { id: "c10", trait: "conscientiousness", keyed: "-", ipipFactor: "Factor III", construct: "Low Caution", statement: "I sometimes ship early versions before checking all secondary dependencies." },

  // Factor I: Extraversion (e1 - e10: 5+, 5-)
  { id: "e1", trait: "extraversion", keyed: "+", ipipFactor: "Factor I", construct: "Liveliness", statement: "I feel recharged after facilitating lively cross-functional workshops or brainstorming rooms." },
  { id: "e2", trait: "extraversion", keyed: "-", ipipFactor: "Factor I", construct: "Reserve", statement: "I prefer listening quietly in large meetings and sharing structured thoughts later in writing." },
  { id: "e3", trait: "extraversion", keyed: "+", ipipFactor: "Factor I", construct: "Initiative", statement: "I initiate conversations effortlessly with unfamiliar clients, executives, or new teammates." },
  { id: "e4", trait: "extraversion", keyed: "-", ipipFactor: "Factor I", construct: "Solo Recharge", statement: "Back-to-back live video meetings drain my energy far faster than solo deep work." },
  { id: "e5", trait: "extraversion", keyed: "+", ipipFactor: "Factor I", construct: "Assertiveness", statement: "When a group discussion stalls in ambiguity, I naturally step up to frame the decision." },
  { id: "e6", trait: "extraversion", keyed: "-", ipipFactor: "Factor I", construct: "Privacy", statement: "I keep a low profile during company social events and prefer 1:1 conversations." },
  { id: "e7", trait: "extraversion", keyed: "+", ipipFactor: "Factor I", construct: "Tempo", statement: "I enjoy fast-paced live huddles and rapid verbal iteration with colleagues." },
  { id: "e8", trait: "extraversion", keyed: "-", ipipFactor: "Factor I", construct: "Measured Pace", statement: "Frequent Slack pings and spontaneous desk drop-ins break my flow noticeably." },
  { id: "e9", trait: "extraversion", keyed: "+", ipipFactor: "Factor I", construct: "Expressiveness", statement: "I articulate positions persuasively on the spot in front of senior stakeholders." },
  { id: "e10", trait: "extraversion", keyed: "-", ipipFactor: "Factor I", construct: "Written Preference", statement: "I rarely volunteer to be the primary spokesperson on crowded cross-team calls." },

  // Factor II: Agreeableness (a1 - a10: 5+, 5-)
  { id: "a1", trait: "agreeableness", keyed: "+", ipipFactor: "Factor II", construct: "Empathy", statement: "I notice early when a quieter teammate is overloaded and step in to help clear friction." },
  { id: "a2", trait: "agreeableness", keyed: "-", ipipFactor: "Factor II", construct: "Blunt Candor", statement: "I prioritize delivering unvarnished logic over softening feedback to keep the room comfortable." },
  { id: "a3", trait: "agreeableness", keyed: "+", ipipFactor: "Factor II", construct: "Trust", statement: "Building durable goodwill and psychological safety matters just as much as winning a debate." },
  { id: "a4", trait: "agreeableness", keyed: "-", ipipFactor: "Factor II", construct: "Tough Bargaining", statement: "In tough resource negotiations, I hold firm boundaries even when peers push for compromise." },
  { id: "a5", trait: "agreeableness", keyed: "+", ipipFactor: "Factor II", construct: "Cooperation", statement: "I instinctively look for win-win trade-offs when two departments hold conflicting goals." },
  { id: "a6", trait: "agreeableness", keyed: "-", ipipFactor: "Factor II", construct: "Skepticism", statement: "I assume cross-team estimates need hard stress-testing before I rely on them." },
  { id: "a7", trait: "agreeableness", keyed: "+", ipipFactor: "Factor II", construct: "Supportiveness", statement: "I take time to mentor newcomers and credit teammates generously in public readouts." },
  { id: "a8", trait: "agreeableness", keyed: "-", ipipFactor: "Factor II", construct: "Direct Challenge", statement: "I am comfortable challenging a flawed proposal publicly if the numbers do not add up." },
  { id: "a9", trait: "agreeableness", keyed: "+", ipipFactor: "Factor II", construct: "Harmony", statement: "I de-escalate tense Slack threads thoughtfully so working relationships stay intact." },
  { id: "a10", trait: "agreeableness", keyed: "-", ipipFactor: "Factor II", construct: "Task Detachment", statement: "I evaluate technical trade-offs strictly on objective metrics without absorbing emotional subtext." },

  // Factor IV: Emotional Stability (s1 - s10: 5+, 5-)
  { id: "s1", trait: "emotional-stability", keyed: "+", ipipFactor: "Factor IV", construct: "Composure", statement: "When a high-stakes launch breaks unexpectedly, my tone stays calm and focused on triage." },
  { id: "s2", trait: "emotional-stability", keyed: "-", ipipFactor: "Factor IV", construct: "Rumination", statement: "Ambiguous critical feedback from a manager replays in my head long after the meeting ends." },
  { id: "s3", trait: "emotional-stability", keyed: "+", ipipFactor: "Factor IV", construct: "Resilience", statement: "Rejected proposals or tough stakeholder pushback rarely dent my confidence for long." },
  { id: "s4", trait: "emotional-stability", keyed: "-", ipipFactor: "Factor IV", construct: "Stress Reactivity", statement: "Sudden priority shifts late in the week create noticeable tension for me." },
  { id: "s5", trait: "emotional-stability", keyed: "+", ipipFactor: "Factor IV", construct: "Equanimity", statement: "I maintain a steady, non-defensive demeanor even during heated post-mortems." },
  { id: "s6", trait: "emotional-stability", keyed: "-", ipipFactor: "Factor IV", construct: "Anxiety Sensitivity", statement: "I frequently worry about hidden failure modes ahead of major public demos." },
  { id: "s7", trait: "emotional-stability", keyed: "+", ipipFactor: "Factor IV", construct: "Recovery", statement: "After an intense deadline miss, I reset quickly and focus objectively on next steps." },
  { id: "s8", trait: "emotional-stability", keyed: "-", ipipFactor: "Factor IV", construct: "Volatility", statement: "Repeated scope churn can make my written tone noticeably sharp under pressure." },
  { id: "s9", trait: "emotional-stability", keyed: "+", ipipFactor: "Factor IV", construct: "Confidence", statement: "I feel comfortable making reversible decisions with incomplete information." },
  { id: "s10", trait: "emotional-stability", keyed: "-", ipipFactor: "Factor IV", construct: "Tension", statement: "Unclear expectations from leadership weigh heavily on my daily focus." },
] as const;

/**
 * Reverses a negatively keyed Likert item rating using `(scaleMin + scaleMax) - value`
 * (for a standard 1-5 scale: `6 - value`).
 */
export function reverseLikert(
  value: number,
  scaleMin = 1,
  scaleMax = 5,
  allowDecimals = false
): number {
  assertValidScaleBounds(scaleMin, scaleMax);
  const valid = assertValidLikertRating(value, "reverseLikert", scaleMin, scaleMax, allowDecimals);
  return scaleMin + scaleMax - valid;
}

/**
 * Linearly normalizes a raw trait sum onto a 0-100 integer scale:
 * `Math.round(((rawScore - minRaw) / (maxRaw - minRaw)) * 100)`.
 */
export function normalizeRawScoreTo100(
  rawScore: number,
  itemCount: number,
  scaleMin = 1,
  scaleMax = 5
): number {
  assertValidScaleBounds(scaleMin, scaleMax);
  if (!Number.isInteger(itemCount) || itemCount < 1) {
    throw new RangeError(`itemCount must be an integer >= 1 (received ${String(itemCount)}).`);
  }
  const minRaw = itemCount * scaleMin;
  const maxRaw = itemCount * scaleMax;
  if (!Number.isFinite(rawScore) || rawScore < minRaw || rawScore > maxRaw) {
    throw new RangeError(
      `rawScore ${String(rawScore)} is outside valid bounds [${minRaw}, ${maxRaw}] for ${itemCount} items.`
    );
  }
  return Math.round(((rawScore - minRaw) / (maxRaw - minRaw)) * 100);
}

/** Maps a 0-100 score onto qualitative low / moderate / high interpretation bands. */
export function getBigFiveBand(score100: number): ScoreBand {
  if (!Number.isFinite(score100) || score100 < 0 || score100 > 100) {
    throw new RangeError(`score100 must be between 0 and 100 (received ${String(score100)}).`);
  }
  if (score100 >= 70) return "high";
  if (score100 >= 40) return "moderate";
  return "low";
}

/**
 * Abramowitz & Stegun standard normal CDF approximation mapping 0-100 scores onto
 * adult workplace percentile benchmarks (centered at mean = 54, sd = 18, clamped 1..99).
 */
export function estimateWorkplacePercentile(score100: number): number {
  if (!Number.isFinite(score100) || score100 < 0 || score100 > 100) {
    throw new RangeError(`score100 must be between 0 and 100 (received ${String(score100)}).`);
  }
  const z = (score100 - 54) / 18;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const cdf = z >= 0 ? 1 - prob : prob;
  return clamp(Math.round(cdf * 100), 1, 99);
}

/**
 * Evaluates raw response variance and within-trait positive vs reverse-keyed agreement
 * to detect straight-lining (e.g., clicking 3 or 5 across all '+' and '-' items).
 */
export function computeResponseValidity(
  items: readonly IpipItem[],
  answers: Record<string, number>,
  options: Pick<IpipScoringOptions, "scaleMin" | "scaleMax" | "allowDecimals"> = {}
): ResponseValidityReport {
  const scaleMin = options.scaleMin ?? 1;
  const scaleMax = options.scaleMax ?? 5;
  const allowDecimals = options.allowDecimals ?? false;
  assertValidScaleBounds(scaleMin, scaleMax);
  const validAnswers = assertPlainRecord(answers, "answers");

  const rawValues: number[] = [];
  for (const item of items) {
    if (Object.prototype.hasOwnProperty.call(validAnswers, item.id)) {
      const val = validAnswers[item.id];
      if (val !== undefined) {
        rawValues.push(assertValidLikertRating(val, item.id, scaleMin, scaleMax, allowDecimals));
      }
    }
  }

  const n = rawValues.length;
  if (n === 0) {
    throw new RangeError("Cannot evaluate validity: no matching item answers were provided.");
  }

  const mean = rawValues.reduce((acc, v) => acc + v, 0) / n;
  const variance = rawValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stdDev = Number(Math.sqrt(variance).toFixed(2));

  const traitMads: number[] = [];
  for (const trait of BIG_FIVE_TRAIT_ORDER) {
    const tItems = items.filter(
      (it) => it.trait === trait && validAnswers[it.id] !== undefined
    );
    if (tItems.length < 2) continue;
    const keyedScores = tItems.map((it) => {
      const raw = validAnswers[it.id] as number;
      return it.keyed === "+" ? raw : scaleMin + scaleMax - raw;
    });
    const tMean = keyedScores.reduce((acc, v) => acc + v, 0) / keyedScores.length;
    const mad =
      keyedScores.reduce((acc, v) => acc + Math.abs(v - tMean), 0) / keyedScores.length;
    traitMads.push(mad);
  }

  const avgMad =
    traitMads.length > 0
      ? traitMads.reduce((a, b) => a + b, 0) / traitMads.length
      : 0.8;

  const straightLiningDetected = n >= 10 && stdDev < 0.35;
  if (straightLiningDetected) {
    return {
      status: "low-variance-caution",
      consistencyScore: 42,
      responseStdDev: stdDev,
      answeredCount: n,
      totalItems: items.length,
      straightLiningDetected: true,
      note: "Low raw Likert variance across positive and reverse-keyed statements suggests straight-lining.",
    };
  }

  const consistencyScore = clamp(
    Math.round(100 - Math.max(0, avgMad - 0.35) * 34),
    48,
    98
  );

  if (consistencyScore >= 76) {
    return {
      status: "high-consistency",
      consistencyScore,
      responseStdDev: stdDev,
      answeredCount: n,
      totalItems: items.length,
      straightLiningDetected: false,
      note: "Positive and reverse-keyed statements align coherently across Big Five domains.",
    };
  }

  return {
    status: "moderate-variance",
    consistencyScore,
    responseStdDev: stdDev,
    answeredCount: n,
    totalItems: items.length,
    straightLiningDetected: false,
    note: "Moderate within-trait spread reflects situational nuance across workplace contexts.",
  };
}

/**
 * Scores an arbitrary array of IPIP items (such as IPIP-50, IPIP-20, or custom subscales)
 * with reverse-keyed inversion, strict validation, 0-100 normalization, and O*NET 31.0 mapping.
 */
export function scoreIpipItems(
  items: readonly IpipItem[],
  answers: Record<string, number>,
  options: IpipScoringOptions = {}
): IpipEvaluationResult {
  if (!Array.isArray(items) || items.length === 0) {
    throw new RangeError("items must be a non-empty array of IpipItem definitions.");
  }

  const scaleMin = options.scaleMin ?? 1;
  const scaleMax = options.scaleMax ?? 5;
  const allowDecimals = options.allowDecimals ?? false;
  const missingPolicy: MissingItemPolicy = options.missingPolicy ?? "error";
  assertValidScaleBounds(scaleMin, scaleMax);

  const rawRecord = assertPlainRecord(answers, "answers");
  const midpoint = (scaleMin + scaleMax) / 2;

  const missingIds: string[] = [];
  const validatedAnswers: Record<string, number> = {};
  let matchedCount = 0;

  for (const item of items) {
    const hasKey = Object.prototype.hasOwnProperty.call(rawRecord, item.id);
    const val = hasKey ? rawRecord[item.id] : undefined;

    if (val === undefined) {
      missingIds.push(item.id);
      continue;
    }

    validatedAnswers[item.id] = assertValidLikertRating(
      val,
      item.id,
      scaleMin,
      scaleMax,
      allowDecimals
    );
    matchedCount += 1;
  }

  if (matchedCount === 0) {
    throw new RangeError("No valid matching IPIP item answers were provided.");
  }

  if (missingIds.length > 0 && missingPolicy === "error") {
    const preview = missingIds.slice(0, 5).join(", ");
    const suffix = missingIds.length > 5 ? ` (+${missingIds.length - 5} more)` : "";
    throw new RangeError(
      `Missing ${missingIds.length} required IPIP item response(s): ${preview}${suffix}. Pass missingPolicy: "neutral" or "omit" for partial scoring.`
    );
  }

  const dimensions: BigFiveTraitResult[] = BIG_FIVE_TRAIT_ORDER.map((trait) => {
    const traitItems = items.filter((item) => item.trait === trait);
    if (traitItems.length === 0) {
      throw new RangeError(`No IPIP items defined for required Big Five trait "${trait}".`);
    }

    let rawScore = 0;
    let answeredCount = 0;
    let effectiveCount = 0;

    for (const item of traitItems) {
      const rating = validatedAnswers[item.id];
      if (rating !== undefined) {
        const keyedVal = item.keyed === "+" ? rating : scaleMin + scaleMax - rating;
        rawScore += keyedVal;
        answeredCount += 1;
        effectiveCount += 1;
      } else if (missingPolicy === "neutral") {
        rawScore += midpoint;
        effectiveCount += 1;
      }
    }

    if (effectiveCount === 0) {
      throw new RangeError(
        `Cannot score trait "${trait}" with missingPolicy="omit": zero items answered for this trait.`
      );
    }

    const minRaw = effectiveCount * scaleMin;
    const maxRaw = effectiveCount * scaleMax;
    const score100 = normalizeRawScoreTo100(rawScore, effectiveCount, scaleMin, scaleMax);
    const band = getBigFiveBand(score100);
    const percentile = estimateWorkplacePercentile(score100);
    const meta = IPIP50_TRAIT_METADATA[trait];
    const summary =
      band === "high"
        ? meta.highSummary
        : band === "moderate"
          ? meta.moderateSummary
          : meta.lowSummary;

    return {
      key: trait,
      label: meta.label,
      ipipFactor: meta.ipipFactor,
      rawScore,
      minRaw,
      maxRaw,
      answeredCount,
      totalItems: traitItems.length,
      score100,
      percentile,
      band,
      summary,
    };
  });

  const sorted = [...dimensions].sort((a, b) => {
    const diff = b.score100 - a.score100;
    if (diff !== 0) return diff;
    return BIG_FIVE_TRAIT_ORDER.indexOf(a.key) - BIG_FIVE_TRAIT_ORDER.indexOf(b.key);
  });

  const scoresByTrait = Object.fromEntries(
    dimensions.map((d) => [d.key, d.score100])
  ) as BigFiveScores;
  const percentilesByTrait = Object.fromEntries(
    dimensions.map((d) => [d.key, d.percentile])
  ) as BigFiveScores;

  const validity = computeResponseValidity(items, validatedAnswers, {
    scaleMin,
    scaleMax,
    allowDecimals,
  });
  const onetClusters = rankOnetWorkStyleClusters(scoresByTrait);
  const { topMatches, stretchMatch } = rankOnetRoles(scoresByTrait);

  return {
    dimensions,
    scoresByTrait,
    percentilesByTrait,
    dominantTrait: sorted[0],
    secondaryTrait: sorted[1],
    validity,
    onetClusters,
    topRoleMatches: topMatches,
    stretchRoleMatch: stretchMatch,
  };
}

/**
 * Convenience wrapper scoring the built-in 50-item public-domain IPIP-50 workplace marker inventory
 * (`o1..o10`, `c1..c10`, `e1..e10`, `a1..a10`, `s1..s10`).
 */
export function scoreIpip50(
  answers: Record<string, number>,
  options: IpipScoringOptions = {}
): IpipEvaluationResult {
  return scoreIpipItems(IPIP50_ITEMS, answers, options);
}

// ---------------------------------------------------------------------------
// 2. 4-Color Workstyle Quadrant Scorer
// ---------------------------------------------------------------------------

/** Trademark-clean 4-color workplace profile identifiers. */
export type WorkColorId = "crimson" | "amber" | "sage" | "slate";

/** Canonical evaluation order for tie-breaking and iteration. */
export const WORK_COLOR_ORDER: readonly WorkColorId[] = [
  "crimson",
  "amber",
  "sage",
  "slate",
] as const;

export const WORK_COLOR_DISCLAIMER =
  "Independent educational model aligned with public-domain IPIP Big Five constructs. Not affiliated with or endorsed by Insights Discovery(R), True Colors(R), Everything DiSC(R), or Surrounded by Idiots(R).";

export interface WorkColorProfile {
  readonly id: WorkColorId;
  readonly slug: string;
  readonly colorLabel: string;
  readonly name: string;
  readonly quadrant: string;
  readonly bigFiveAnchor: string;
  readonly summary: string;
}

export const WORK_COLOR_PROFILES: Record<WorkColorId, WorkColorProfile> = {
  crimson: {
    id: "crimson",
    slug: "red-work-personality",
    colorLabel: "Red",
    name: "Crimson Driver",
    quadrant: "Fast-Paced x Task-Logic",
    bigFiveAnchor: "High Extraversion (Assertiveness) + Goal-Directed Conscientiousness",
    summary: "Cuts through ambiguity rapidly, sets single-owner deadlines, and drives outcomes under pressure.",
  },
  amber: {
    id: "amber",
    slug: "yellow-work-personality",
    colorLabel: "Yellow",
    name: "Amber Catalyst",
    quadrant: "Fast-Paced x People-Alignment",
    bigFiveAnchor: "High Extraversion + Openness to Novelty",
    summary: "Generates narrative momentum, rallies cross-functional stakeholders, and sparks creative breakthroughs.",
  },
  sage: {
    id: "sage",
    slug: "green-work-personality",
    colorLabel: "Green",
    name: "Sage Anchor",
    quadrant: "Methodical x People-Alignment",
    bigFiveAnchor: "High Agreeableness + Steady Emotional Composure",
    summary: "Protects team psychological safety, smooths cross-silo handoffs, and sustains reliable cadence.",
  },
  slate: {
    id: "slate",
    slug: "blue-work-personality",
    colorLabel: "Blue",
    name: "Slate Strategist",
    quadrant: "Methodical x Task-Logic",
    bigFiveAnchor: "High Conscientiousness (Precision) + Analytical Openness",
    summary: "Audits assumptions, designs clean systems, and validates risk edge cases before launch.",
  },
};

export interface WorkColorScoreResult {
  primary: WorkColorProfile;
  secondary: WorkColorProfile;
  percentages: Record<WorkColorId, number>;
  counts: Record<WorkColorId, number>;
  totalResponses: number;
  /** Horizontal axis (-100 Task-Logic to +100 People-Alignment). */
  coordX: number;
  /** Vertical axis (-100 Methodical Depth to +100 Fast-Paced Urgency). */
  coordY: number;
  /** Estimated IPIP Big Five traits derived from 4-color distribution. */
  estimatedBigFive: Omit<BigFiveScores, "emotional-stability">;
}

export interface WorkColorComparisonResult {
  synergyScore: number;
  samePrimary: boolean;
  euclideanDistance: number;
  dominantAxisContrast: "task-vs-people" | "tempo" | "aligned";
  summary: string;
}

/**
 * Scores 4-Color Workstyle choices, computing normalized percentages summing strictly to 100,
 * 2D behavioral quadrant coordinates (`coordX`, `coordY` in `[-100, 100]`), deterministic ranking,
 * and Big Five trait approximations.
 */
export function scoreWorkColors(
  input:
    | readonly WorkColorId[]
    | Record<string, WorkColorId>
    | Partial<Record<WorkColorId, number>>
): WorkColorScoreResult {
  const { counts, total } = resolveDiscreteCounts(input, WORK_COLOR_ORDER, "WorkColor");
  const percentages = largestRemainderPercentages(counts, WORK_COLOR_ORDER);

  const coordX = clamp(
    Math.round(percentages.amber + percentages.sage - (percentages.crimson + percentages.slate)),
    -100,
    100
  );
  const coordY = clamp(
    Math.round(percentages.crimson + percentages.amber - (percentages.slate + percentages.sage)),
    -100,
    100
  );

  const quadrantAffinity = (id: WorkColorId): number => {
    if (id === "crimson") return coordY - coordX;
    if (id === "amber") return coordY + coordX;
    if (id === "sage") return coordX - coordY;
    return -coordX - coordY;
  };

  const ranked = [...WORK_COLOR_ORDER].sort((a, b) => {
    const pctDiff = percentages[b] - percentages[a];
    if (pctDiff !== 0) return pctDiff;
    const quadDiff = quadrantAffinity(b) - quadrantAffinity(a);
    if (quadDiff !== 0) return quadDiff;
    return WORK_COLOR_ORDER.indexOf(a) - WORK_COLOR_ORDER.indexOf(b);
  });

  const estimatedBigFive: Omit<BigFiveScores, "emotional-stability"> = {
    extraversion: clamp(Math.round(25 + (percentages.crimson + percentages.amber) * 0.65), 18, 95),
    agreeableness: clamp(
      Math.round(
        45 +
          0.5 * (percentages.sage + 0.5 * percentages.amber) -
          0.35 * (percentages.crimson + 0.3 * percentages.slate)
      ),
      20,
      94
    ),
    conscientiousness: clamp(
      Math.round(28 + (percentages.slate + 0.5 * percentages.sage) * 0.65),
      22,
      94
    ),
    openness: clamp(Math.round(30 + (percentages.amber + 0.5 * percentages.slate) * 0.62), 24, 93),
  };

  return {
    primary: WORK_COLOR_PROFILES[ranked[0]],
    secondary: WORK_COLOR_PROFILES[ranked[1]],
    percentages,
    counts,
    totalResponses: total,
    coordX,
    coordY,
    estimatedBigFive,
  };
}

/** Computes pairwise collaboration synergy and quadrant contrast between two 4-Color results. */
export function compareWorkColors(
  self: WorkColorScoreResult,
  peer: WorkColorScoreResult
): WorkColorComparisonResult {
  const avgPctGap =
    WORK_COLOR_ORDER.reduce(
      (acc, id) => acc + Math.abs(self.percentages[id] - peer.percentages[id]),
      0
    ) / 4;
  const dist = Number(Math.hypot(self.coordX - peer.coordX, self.coordY - peer.coordY).toFixed(2));
  const synergyScore = clamp(
    Math.round(92 - avgPctGap * 0.45 - Math.max(0, dist - 75) * 0.14),
    56,
    96
  );

  const xDiff = Math.abs(self.coordX - peer.coordX);
  const yDiff = Math.abs(self.coordY - peer.coordY);
  const samePrimary = self.primary.id === peer.primary.id;

  const dominantAxisContrast: WorkColorComparisonResult["dominantAxisContrast"] =
    xDiff < 15 && yDiff < 15 ? "aligned" : xDiff >= yDiff ? "task-vs-people" : "tempo";

  const summary = samePrimary
    ? `Mirror pairing (${self.primary.name} + ${peer.primary.name}) with ${synergyScore}/100 synergy; assign explicit blind-spot checks in opposite quadrants.`
    : `Complementary pairing (${self.primary.name} + ${peer.primary.name}) across ${dominantAxisContrast} (${synergyScore}/100 synergy).`;

  return {
    synergyScore,
    samePrimary,
    euclideanDistance: dist,
    dominantAxisContrast,
    summary,
  };
}

// ---------------------------------------------------------------------------
// 3. Dual-Concern Workplace Conflict Style Scorer
// ---------------------------------------------------------------------------

/** Five workplace conflict management modes grounded in dual-concern literature. */
export type ConflictModeId =
  | "collaborative-integrator"
  | "direct-challenger"
  | "pragmatic-compromiser"
  | "diplomatic-harmonizer"
  | "strategic-de-escalator";

export const CONFLICT_MODE_ORDER: readonly ConflictModeId[] = [
  "collaborative-integrator",
  "direct-challenger",
  "pragmatic-compromiser",
  "diplomatic-harmonizer",
  "strategic-de-escalator",
] as const;

export interface ConflictModeProfile {
  readonly id: ConflictModeId;
  readonly name: string;
  readonly shortLabel: string;
  readonly assertivenessWeight: number;
  readonly cooperativenessWeight: number;
  readonly zoneLabel: string;
}

export const CONFLICT_MODE_PROFILES: Record<ConflictModeId, ConflictModeProfile> = {
  "collaborative-integrator": {
    id: "collaborative-integrator",
    name: "Collaborative Integrator",
    shortLabel: "Integrator",
    assertivenessWeight: 90,
    cooperativenessWeight: 90,
    zoneLabel: "High Assertiveness x High Cooperativeness",
  },
  "direct-challenger": {
    id: "direct-challenger",
    name: "Direct Challenger",
    shortLabel: "Challenger",
    assertivenessWeight: 92,
    cooperativenessWeight: 12,
    zoneLabel: "High Assertiveness x Low Cooperativeness",
  },
  "pragmatic-compromiser": {
    id: "pragmatic-compromiser",
    name: "Pragmatic Compromiser",
    shortLabel: "Compromiser",
    assertivenessWeight: 56,
    cooperativenessWeight: 56,
    zoneLabel: "Balanced Assertiveness x Balanced Cooperativeness",
  },
  "diplomatic-harmonizer": {
    id: "diplomatic-harmonizer",
    name: "Diplomatic Harmonizer",
    shortLabel: "Harmonizer",
    assertivenessWeight: 16,
    cooperativenessWeight: 88,
    zoneLabel: "Low Assertiveness x High Cooperativeness",
  },
  "strategic-de-escalator": {
    id: "strategic-de-escalator",
    name: "Strategic De-escalator",
    shortLabel: "De-escalator",
    assertivenessWeight: 16,
    cooperativenessWeight: 18,
    zoneLabel: "Low Assertiveness x Low Cooperativeness",
  },
};

export interface ConflictScoreResult {
  primary: ConflictModeProfile;
  backup: ConflictModeProfile;
  gridZoneMode: ConflictModeProfile;
  percentages: Record<ConflictModeId, number>;
  counts: Record<ConflictModeId, number>;
  assertivenessPct: number;
  cooperativenessPct: number;
  totalResponses: number;
}

/**
 * Scores dual-concern workplace conflict responses (Blake & Mouton, 1964; Rahim, 1983),
 * outputting primary/backup modes, nearest 2D grid mode, and Assertiveness x Cooperativeness coordinates.
 */
export function scoreConflictModes(
  input:
    | readonly ConflictModeId[]
    | Record<string, ConflictModeId>
    | Partial<Record<ConflictModeId, number>>
): ConflictScoreResult {
  const { counts, total } = resolveDiscreteCounts(input, CONFLICT_MODE_ORDER, "ConflictMode");
  const percentages = largestRemainderPercentages(counts, CONFLICT_MODE_ORDER);

  let weightedAssertiveness = 0;
  let weightedCooperativeness = 0;
  for (const id of CONFLICT_MODE_ORDER) {
    const profile = CONFLICT_MODE_PROFILES[id];
    const share = counts[id] / total;
    weightedAssertiveness += share * profile.assertivenessWeight;
    weightedCooperativeness += share * profile.cooperativenessWeight;
  }

  const assertivenessPct = clamp(Math.round(weightedAssertiveness), 0, 100);
  const cooperativenessPct = clamp(Math.round(weightedCooperativeness), 0, 100);

  const ranked = [...CONFLICT_MODE_ORDER].sort((a, b) => {
    const diff = counts[b] - counts[a];
    if (diff !== 0) return diff;
    return CONFLICT_MODE_ORDER.indexOf(a) - CONFLICT_MODE_ORDER.indexOf(b);
  });

  let nearestMode: ConflictModeId = ranked[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const id of CONFLICT_MODE_ORDER) {
    const prof = CONFLICT_MODE_PROFILES[id];
    const d = Math.hypot(
      assertivenessPct - prof.assertivenessWeight,
      cooperativenessPct - prof.cooperativenessWeight
    );
    if (d < bestDist) {
      bestDist = d;
      nearestMode = id;
    }
  }

  return {
    primary: CONFLICT_MODE_PROFILES[ranked[0]],
    backup: CONFLICT_MODE_PROFILES[ranked[1]],
    gridZoneMode: CONFLICT_MODE_PROFILES[nearestMode],
    percentages,
    counts,
    assertivenessPct,
    cooperativenessPct,
    totalResponses: total,
  };
}

// ---------------------------------------------------------------------------
// 4. Functional Team Roles & Multi-Person Team Dynamics Scorer
// ---------------------------------------------------------------------------

/** Five functional squad role identifiers aligned with Big Five team composition research. */
export type TeamRoleId =
  | "action-driver"
  | "strategic-thinker"
  | "team-anchor"
  | "resource-spark"
  | "rigorous-finisher";

export const TEAM_ROLE_ORDER: readonly TeamRoleId[] = [
  "action-driver",
  "strategic-thinker",
  "team-anchor",
  "resource-spark",
  "rigorous-finisher",
] as const;

export interface TeamRoleProfile {
  readonly id: TeamRoleId;
  readonly slug: string;
  readonly name: string;
  readonly subtitle: string;
  readonly bigFiveSignature: string;
}

export const TEAM_ROLE_PROFILES: Record<TeamRoleId, TeamRoleProfile> = {
  "action-driver": {
    id: "action-driver",
    slug: "action-driver",
    name: "Action Driver",
    subtitle: "Momentum Lead",
    bigFiveSignature: "High Extraversion (Assertiveness) + Action-Biased Conscientiousness",
  },
  "strategic-thinker": {
    id: "strategic-thinker",
    slug: "strategic-thinker",
    name: "Strategic Thinker",
    subtitle: "Systems Analyst",
    bigFiveSignature: "High Openness (Synthesis) + Objective Analytical Judgment",
  },
  "team-anchor": {
    id: "team-anchor",
    slug: "team-anchor",
    name: "Team Anchor",
    subtitle: "Cohesion Builder",
    bigFiveSignature: "High Agreeableness + Steady Emotional Stability",
  },
  "resource-spark": {
    id: "resource-spark",
    slug: "resource-spark",
    name: "Resource Spark",
    subtitle: "External Explorer",
    bigFiveSignature: "High Openness + High Social Initiative",
  },
  "rigorous-finisher": {
    id: "rigorous-finisher",
    slug: "rigorous-finisher",
    name: "Rigorous Finisher",
    subtitle: "Quality Guardian",
    bigFiveSignature: "High Conscientiousness (Order & Precision)",
  },
};

export interface TeamRoleScoreResult {
  primary: TeamRoleProfile;
  secondary: TeamRoleProfile;
  coverageGapRole: TeamRoleProfile;
  percentages: Record<TeamRoleId, number>;
  counts: Record<TeamRoleId, number>;
  totalResponses: number;
}

/** Scores functional team role responses and identifies primary, backup, and gap roles. */
export function scoreTeamRoles(
  input:
    | readonly TeamRoleId[]
    | Record<string, TeamRoleId>
    | Partial<Record<TeamRoleId, number>>
): TeamRoleScoreResult {
  const { counts, total } = resolveDiscreteCounts(input, TEAM_ROLE_ORDER, "TeamRole");
  const percentages = largestRemainderPercentages(counts, TEAM_ROLE_ORDER);

  const ranked = [...TEAM_ROLE_ORDER].sort((a, b) => {
    const diff = percentages[b] - percentages[a];
    if (diff !== 0) return diff;
    return TEAM_ROLE_ORDER.indexOf(a) - TEAM_ROLE_ORDER.indexOf(b);
  });

  return {
    primary: TEAM_ROLE_PROFILES[ranked[0]],
    secondary: TEAM_ROLE_PROFILES[ranked[1]],
    coverageGapRole: TEAM_ROLE_PROFILES[ranked[ranked.length - 1]],
    percentages,
    counts,
    totalResponses: total,
  };
}

export interface TeamMemberProfile {
  name: string;
  scores: BigFiveScores;
}

export interface TeamDynamicsSummary {
  memberCount: number;
  meanScores: BigFiveScores;
  traitStdDev: BigFiveScores;
  cognitiveDiversityIndex: number;
  blindSpotAlerts: string[];
}

/**
 * Evaluates multi-person Big Five team balance (2-12 members), returning trait means,
 * trait diversity spread, cognitive diversity index, and operational blind-spot alerts.
 */
export function scoreTeamDynamics(members: readonly TeamMemberProfile[]): TeamDynamicsSummary {
  if (!Array.isArray(members) || members.length < 2 || members.length > 12) {
    throw new RangeError("members must be an array containing between 2 and 12 team profiles.");
  }

  const normalizedMembers = members.map((member, idx) => {
    if (!isPlainRecord(member) || typeof member.name !== "string" || !member.name.trim()) {
      throw new TypeError(`Invalid team member at index ${idx}: non-empty "name" required.`);
    }
    return {
      name: member.name.trim(),
      scores: assertValidBigFiveScores(member.scores, `members[${idx}].scores`),
    };
  });

  const n = normalizedMembers.length;
  const meanScores = {} as BigFiveScores;
  const traitStdDev = {} as BigFiveScores;

  for (const trait of BIG_FIVE_TRAIT_ORDER) {
    const vals = normalizedMembers.map((m) => m.scores[trait]);
    const mean = vals.reduce((acc, v) => acc + v, 0) / n;
    const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    meanScores[trait] = Math.round(mean);
    traitStdDev[trait] = Number(Math.sqrt(variance).toFixed(1));
  }

  const avgSpread =
    BIG_FIVE_TRAIT_ORDER.reduce((acc, t) => acc + traitStdDev[t], 0) /
    BIG_FIVE_TRAIT_ORDER.length;
  const cognitiveDiversityIndex = clamp(Math.round((avgSpread / 28) * 100), 5, 100);

  const blindSpotAlerts: string[] = [];
  const maxConscientiousness = Math.max(
    ...normalizedMembers.map((m) => m.scores.conscientiousness)
  );
  if (maxConscientiousness < 60) {
    blindSpotAlerts.push(
      "Execution Closure Risk: no member scores >= 60 on Conscientiousness; assign explicit QA checklists before release."
    );
  }
  if (meanScores.openness < 45 && traitStdDev.openness < 10) {
    blindSpotAlerts.push(
      "Exploration Blind Spot: tightly clustered conventional Openness; schedule dedicated external benchmark reviews."
    );
  }
  if (meanScores.agreeableness < 45 && meanScores["emotional-stability"] < 55) {
    blindSpotAlerts.push(
      "Escalation Friction Risk: candid low Agreeableness combined with moderate composure; enforce async pre-reads for heated decisions."
    );
  }
  if (meanScores.extraversion > 75 && traitStdDev.extraversion < 10) {
    blindSpotAlerts.push(
      "Loudest-Voice Bias Risk: uniformly high Extraversion; use silent written RFC voting before live debates."
    );
  }

  return {
    memberCount: n,
    meanScores,
    traitStdDev,
    cognitiveDiversityIndex,
    blindSpotAlerts,
  };
}

// ---------------------------------------------------------------------------
// 5. O*NET 31.0 Work Style Clusters & Occupational Role Alignment (CC BY 4.0)
// ---------------------------------------------------------------------------

export interface OnetWorkStyleClusterDefinition {
  readonly id: string;
  readonly name: string;
  readonly onetCategory: string;
  readonly description: string;
  readonly weights: BigFiveScores;
}

/**
 * Seven core workplace work-style clusters aligned with the U.S. Department of Labor
 * O*NET 31.0 Work Styles taxonomy (CC BY 4.0).
 */
export const ONET_WORK_STYLE_CLUSTERS: readonly OnetWorkStyleClusterDefinition[] = [
  {
    id: "achievement-persistence",
    name: "Achievement, Effort & Persistence",
    onetCategory: "O*NET Achievement Orientation",
    description: "Establishing high personal delivery standards and persisting past operational blockers.",
    weights: { openness: 0.1, conscientiousness: 0.65, extraversion: 0.1, agreeableness: 0.0, "emotional-stability": 0.15 },
  },
  {
    id: "dependability-attention",
    name: "Dependability, Integrity & Attention to Detail",
    onetCategory: "O*NET Conscientiousness",
    description: "Fulfilling commitments carefully, verifying specs, and protecting accuracy.",
    weights: { openness: 0.0, conscientiousness: 0.7, extraversion: 0.0, agreeableness: 0.15, "emotional-stability": 0.15 },
  },
  {
    id: "leadership-initiative",
    name: "Leadership, Initiative & Social Influence",
    onetCategory: "O*NET Social Influence",
    description: "Stepping forward to coordinate teams, frame priorities, and mobilize energy.",
    weights: { openness: 0.15, conscientiousness: 0.2, extraversion: 0.5, agreeableness: 0.0, "emotional-stability": 0.15 },
  },
  {
    id: "cooperation-empathy",
    name: "Cooperation, Concern for Others & Social Orientation",
    onetCategory: "O*NET Interpersonal Orientation",
    description: "Maintaining constructive rapport, supporting overloaded colleagues, and reducing silo friction.",
    weights: { openness: 0.05, conscientiousness: 0.1, extraversion: 0.2, agreeableness: 0.55, "emotional-stability": 0.1 },
  },
  {
    id: "self-control-stress-tolerance",
    name: "Self-Control & Stress Tolerance",
    onetCategory: "O*NET Adjustment",
    description: "Remaining composed, non-defensive, and clear-headed during incident escalation or critique.",
    weights: { openness: 0.0, conscientiousness: 0.15, extraversion: 0.0, agreeableness: 0.15, "emotional-stability": 0.7 },
  },
  {
    id: "analytical-innovation",
    name: "Analytical Thinking & Innovation",
    onetCategory: "O*NET Practical Intelligence",
    description: "Synthesizing complex information, reframing systems, and piloting novel solutions.",
    weights: { openness: 0.65, conscientiousness: 0.2, extraversion: 0.05, agreeableness: 0.0, "emotional-stability": 0.1 },
  },
  {
    id: "adaptability-independence",
    name: "Adaptability, Flexibility & Independence",
    onetCategory: "O*NET Adjustment & Independence",
    description: "Pivoting calmly when roadmaps change and executing self-directed work cleanly.",
    weights: { openness: 0.4, conscientiousness: 0.15, extraversion: 0.05, agreeableness: 0.05, "emotional-stability": 0.35 },
  },
] as const;

export interface OnetRoleVector {
  readonly slug: string;
  readonly title: string;
  readonly family: string;
  readonly onetCode: string;
  readonly idealScores: BigFiveScores;
  readonly weights: BigFiveScores;
}

/** 12 O*NET 31.0-referenced occupational benchmark vectors for educational role-fit reflection. */
export const ONET_WORKPLACE_ROLES: readonly OnetRoleVector[] = [
  {
    slug: "product-manager",
    title: "Product Manager",
    family: "Product & Strategy",
    onetCode: "O*NET 15-1299.09",
    idealScores: { openness: 76, conscientiousness: 74, extraversion: 68, agreeableness: 64, "emotional-stability": 72 },
    weights: { openness: 1.2, conscientiousness: 1.15, extraversion: 1.0, agreeableness: 0.95, "emotional-stability": 1.1 },
  },
  {
    slug: "staff-software-engineer",
    title: "Staff / Principal Engineer",
    family: "Engineering & Architecture",
    onetCode: "O*NET 15-1252.00",
    idealScores: { openness: 78, conscientiousness: 78, extraversion: 42, agreeableness: 56, "emotional-stability": 74 },
    weights: { openness: 1.2, conscientiousness: 1.25, extraversion: 0.85, agreeableness: 0.85, "emotional-stability": 1.1 },
  },
  {
    slug: "engineering-manager",
    title: "Engineering / Team Manager",
    family: "People & Delivery Leadership",
    onetCode: "O*NET 11-9041.00",
    idealScores: { openness: 64, conscientiousness: 76, extraversion: 64, agreeableness: 72, "emotional-stability": 78 },
    weights: { openness: 0.9, conscientiousness: 1.15, extraversion: 1.0, agreeableness: 1.2, "emotional-stability": 1.25 },
  },
  {
    slug: "ux-researcher-designer",
    title: "Product Designer / UX Researcher",
    family: "Design & Research",
    onetCode: "O*NET 15-1255.00",
    idealScores: { openness: 84, conscientiousness: 64, extraversion: 54, agreeableness: 74, "emotional-stability": 62 },
    weights: { openness: 1.35, conscientiousness: 0.95, extraversion: 0.85, agreeableness: 1.15, "emotional-stability": 0.85 },
  },
  {
    slug: "founder-zero-to-one",
    title: "0-to-1 Founder / Venture GM",
    family: "Executive & Entrepreneurship",
    onetCode: "O*NET 11-1021.00",
    idealScores: { openness: 82, conscientiousness: 72, extraversion: 74, agreeableness: 48, "emotional-stability": 80 },
    weights: { openness: 1.25, conscientiousness: 1.05, extraversion: 1.1, agreeableness: 0.9, "emotional-stability": 1.3 },
  },
  {
    slug: "data-scientist-analyst",
    title: "Data Scientist / Quantitative Analyst",
    family: "Data & Analytics",
    onetCode: "O*NET 15-2051.00",
    idealScores: { openness: 76, conscientiousness: 82, extraversion: 38, agreeableness: 52, "emotional-stability": 68 },
    weights: { openness: 1.15, conscientiousness: 1.3, extraversion: 0.85, agreeableness: 0.85, "emotional-stability": 0.95 },
  },
  {
    slug: "operations-revops-lead",
    title: "Operations / RevOps & Program Lead",
    family: "Operations & Execution",
    onetCode: "O*NET 11-3012.00",
    idealScores: { openness: 52, conscientiousness: 88, extraversion: 58, agreeableness: 62, "emotional-stability": 76 },
    weights: { openness: 0.85, conscientiousness: 1.4, extraversion: 0.9, agreeableness: 0.95, "emotional-stability": 1.15 },
  },
  {
    slug: "enterprise-account-exec",
    title: "Enterprise Sales / Partnerships Lead",
    family: "Revenue & GTM",
    onetCode: "O*NET 41-4011.00",
    idealScores: { openness: 62, conscientiousness: 72, extraversion: 84, agreeableness: 56, "emotional-stability": 76 },
    weights: { openness: 0.85, conscientiousness: 1.05, extraversion: 1.35, agreeableness: 0.95, "emotional-stability": 1.2 },
  },
  {
    slug: "customer-success-partner",
    title: "Customer Success / Client Partner",
    family: "Revenue & GTM",
    onetCode: "O*NET 13-1199.05",
    idealScores: { openness: 58, conscientiousness: 74, extraversion: 72, agreeableness: 82, "emotional-stability": 72 },
    weights: { openness: 0.85, conscientiousness: 1.1, extraversion: 1.1, agreeableness: 1.35, "emotional-stability": 1.1 },
  },
  {
    slug: "technical-writer-docs",
    title: "Technical Writer / Knowledge Architect",
    family: "Content & Documentation",
    onetCode: "O*NET 27-3042.00",
    idealScores: { openness: 72, conscientiousness: 84, extraversion: 34, agreeableness: 64, "emotional-stability": 66 },
    weights: { openness: 1.1, conscientiousness: 1.3, extraversion: 0.9, agreeableness: 0.95, "emotional-stability": 0.9 },
  },
  {
    slug: "sre-security-lead",
    title: "Security / Reliability (SRE) Lead",
    family: "Engineering & Architecture",
    onetCode: "O*NET 15-1212.00",
    idealScores: { openness: 64, conscientiousness: 86, extraversion: 44, agreeableness: 44, "emotional-stability": 84 },
    weights: { openness: 0.95, conscientiousness: 1.3, extraversion: 0.8, agreeableness: 1.0, "emotional-stability": 1.35 },
  },
  {
    slug: "chief-of-staff-strategy",
    title: "Chief of Staff / Strategic Ops",
    family: "Executive & Strategy",
    onetCode: "O*NET 11-1011.00",
    idealScores: { openness: 72, conscientiousness: 82, extraversion: 62, agreeableness: 64, "emotional-stability": 80 },
    weights: { openness: 1.1, conscientiousness: 1.25, extraversion: 0.95, agreeableness: 1.0, "emotional-stability": 1.2 },
  },
] as const;

/**
 * Ranks the 7 O*NET 31.0 Work Style clusters against a user's 0-100 Big Five scores.
 */
export function rankOnetWorkStyleClusters(
  scores: BigFiveScores
): OnetWorkStyleClusterMatch[] {
  const valid = assertValidBigFiveScores(scores, "scores");

  return ONET_WORK_STYLE_CLUSTERS.map((cluster) => {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const trait of BIG_FIVE_TRAIT_ORDER) {
      const w = cluster.weights[trait];
      weightedSum += valid[trait] * w;
      totalWeight += w;
    }
    const score100 = clamp(Math.round(weightedSum / Math.max(1e-6, totalWeight)), 0, 100);
    return {
      id: cluster.id,
      name: cluster.name,
      onetCategory: cluster.onetCategory,
      score100,
      band: getBigFiveBand(score100),
      description: cluster.description,
    };
  }).sort((a, b) => b.score100 - a.score100);
}

/**
 * Ranks the 12 O*NET 31.0 workplace role vectors by weighted RMSE proximity to a 0-100 Big Five profile.
 */
export function rankOnetRoles(
  scores: BigFiveScores,
  topCount = 4
): { topMatches: OnetRoleMatch[]; stretchMatch: OnetRoleMatch; allMatches: OnetRoleMatch[] } {
  const valid = assertValidBigFiveScores(scores, "scores");
  const limit = clamp(Math.floor(topCount), 1, ONET_WORKPLACE_ROLES.length);

  const allMatches: OnetRoleMatch[] = ONET_WORKPLACE_ROLES.map((role) => {
    let weightedSqSum = 0;
    let totalWeight = 0;
    let topAlignedTrait: BigFiveTraitKey = "conscientiousness";
    let smallestGap = Number.POSITIVE_INFINITY;
    let largestGapTrait: BigFiveTraitKey = "extraversion";
    let largestGapPoints = -1;

    for (const trait of BIG_FIVE_TRAIT_ORDER) {
      const w = role.weights[trait];
      const diff = Math.abs(valid[trait] - role.idealScores[trait]);
      weightedSqSum += w * diff * diff;
      totalWeight += w;

      if (diff < smallestGap) {
        smallestGap = diff;
        topAlignedTrait = trait;
      }
      if (diff > largestGapPoints) {
        largestGapPoints = Math.round(diff);
        largestGapTrait = trait;
      }
    }

    const rmse = Math.sqrt(weightedSqSum / Math.max(1e-6, totalWeight));
    const fitScore = clamp(Math.round(100 - rmse * 1.15), 38, 98);

    return {
      slug: role.slug,
      title: role.title,
      family: role.family,
      onetCode: role.onetCode,
      fitScore,
      topAlignedTrait,
      largestGapTrait,
      largestGapPoints,
    };
  }).sort((a, b) => b.fitScore - a.fitScore);

  return {
    topMatches: allMatches.slice(0, limit),
    stretchMatch: allMatches[allMatches.length - 1],
    allMatches,
  };
}

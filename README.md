# `ipip-workplace-scorer`

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)
[![TypeScript ESM](https://img.shields.io/badge/TypeScript-ESM%20%7C%20Strict-3178c6.svg)](./tsconfig.json)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20.0.0-339933.svg)](./package.json)
[![O*NET 31.0 CC BY 4.0](https://img.shields.io/badge/O*NET%2031.0-CC%20BY%204.0-lightgrey.svg)](#scientific-attribution--licensing)

A **zero-dependency, MIT-licensed TypeScript/ESM psychometric scoring engine** built on public-domain **IPIP-50 Big Five** constructs, **U.S. Department of Labor O\*NET 31.0 Work Styles**, **4-Color 2×2 workplace quadrant geometry**, **dual-concern conflict mode scoring**, and **multi-person team dynamics diagnostics**.

Designed for developers, HR-tech builders, organizational researchers, and AI workflow engineers who want deterministic, transparent, privacy-safe workplace scoring (`0–100` normalized scales, reverse-keyed acquiescence protection, and straight-lining detection) without proprietary black-box APIs or forced sign-up walls.

---

## Live Interactive Assessments & Benchmarks

See the full scoring models running client-side in production (no login required) on **[Workplace Style Quiz](https://workplacestylequiz.com)**:

| Assessment / Guide | Methodology | Live Interactive Implementation |
| :--- | :--- | :--- |
| **Work Personality Quiz (Flagship)** | Public-domain IPIP Big Five (20- & 60-item), 15 sub-facets, response validity, O\*NET 31.0 roles | [workplacestylequiz.com](https://workplacestylequiz.com) |
| **What Job Should I Have Quiz** | 18 workplace scenarios mapped to Holland RIASEC codes, 30 O\*NET 31.0 occupations & US BLS pay bands | [workplacestylequiz.com/what-job-should-i-have-quiz](https://workplacestylequiz.com/what-job-should-i-have-quiz) |
| **4-Color Workstyle Assessment** | Trademark-clean Red/Yellow/Green/Blue 2×2 quadrant model mapped to Big Five traits | [workplacestylequiz.com/work-personality-colors](https://workplacestylequiz.com/work-personality-colors) |
| **Leadership Style Quiz** | 15 situational leadership scenarios across 4 executive coaching & pacing profiles | [workplacestylequiz.com/leadership-style-quiz](https://workplacestylequiz.com/leadership-style-quiz) |
| **Team Roles Quiz** | 5 functional squad roles grounded in Big Five team composition research | [workplacestylequiz.com/team-roles-quiz](https://workplacestylequiz.com/team-roles-quiz) |
| **Conflict Style Quiz** | Blake & Mouton / Rahim 2D Assertiveness × Cooperativeness conflict grid | [workplacestylequiz.com/conflict-style-quiz](https://workplacestylequiz.com/conflict-style-quiz) |
| **Big Five vs. DISC at Work** | Psychometric comparison of five-factor traits vs. four-quadrant behavioral models | [workplacestylequiz.com/compare/big-five-vs-disc-at-work](https://workplacestylequiz.com/compare/big-five-vs-disc-at-work) |

---

## Why `ipip-workplace-scorer`?

Most personality assessment APIs and SaaS platforms rely on closed-source weights, opaque "type" buckets, or per-seat paywalls (`$22–$49/seat`) that prevent developers from auditing how Likert responses turn into workplace recommendations.

`ipip-workplace-scorer` provides:

- **Zero Runtime Dependencies**: Pure ES2022 TypeScript/ESM (`0` external npm dependencies). Runs identically in Node.js (`>=20`), Deno, Bun, edge runtimes, and modern browsers.
- **Balanced IPIP-50 Factor Markers**: Built-in 50-item workplace inventory (`10` items per Big Five trait, `5+` direct-keyed and `5-` reverse-keyed per trait) to counter acquiescence bias.
- **Deterministic `0–100` Normalization & Validity Checks**: Exact linear rescaling, Abramowitz & Stegun adult workplace percentile mapping, and automated straight-lining detection.
- **4-Color Quadrant & Synergy Math**: Exact Hamilton largest-remainder percentage normalization summing strictly to `100`, `[-100, +100]` `(coordX, coordY)` quadrant mapping, and pairwise Euclidean synergy scoring.
- **O\*NET 31.0 Work Style & Role Alignment**: Weighted scoring against `7` O\*NET 31.0 Work Style clusters and `12` occupational role vectors using weighted Root Mean Squared Error (`RMSE`).
- **Strict Input Validation**: Explicit `TypeError` and `RangeError` guards for out-of-range ratings, `NaN`, non-integer Likert clicks, invalid category tokens, and empty submissions.

---

## Quick Start

Import directly from the pre-compiled ESM bundle (`dist/index.js` + `dist/index.d.ts`) with **no build step required** on Node.js `>=20`:

```bash
git clone https://github.com/Spders/ipip-workplace-scorer.git
cd ipip-workplace-scorer
node --test
```

Or copy/install locally in any TypeScript or ESM Node project:

```ts
import {
  IPIP50_ITEMS,
  scoreIpip50,
  scoreWorkColors,
  compareWorkColors,
  scoreConflictModes,
  scoreTeamRoles,
  scoreTeamDynamics,
  rankOnetWorkStyleClusters,
  rankOnetRoles,
} from "ipip-workplace-scorer";
```

---

## Usage Examples

### 1. Score an IPIP-50 Big Five Profile + O\*NET 31.0 Alignment

Every item in `IPIP50_ITEMS` uses a 1–5 Likert scale (`1 = Strongly Disagree`, `5 = Strongly Agree`). Reverse-keyed items (`keyed: "-"`) are automatically inverted using `6 - rating` before trait normalization.

```ts
import { IPIP50_ITEMS, scoreIpip50 } from "ipip-workplace-scorer";

// Example: construct valid ratings for all 50 items (`o1..o10`, `c1..c10`, `e1..e10`, `a1..a10`, `s1..s10`)
const answers = Object.fromEntries(
  IPIP50_ITEMS.map((item) => {
    const target =
      item.trait === "conscientiousness" ? 5 :
      item.trait === "openness" ? 4 :
      item.trait === "emotional-stability" ? 4 :
      item.trait === "agreeableness" ? 3 : 2;
    return [item.id, item.keyed === "+" ? target : 6 - target];
  })
);

const profile = scoreIpip50(answers);

console.log(profile.scoresByTrait);
// {
//   openness: 75,
//   conscientiousness: 100,
//   extraversion: 25,
//   agreeableness: 50,
//   "emotional-stability": 75
// }

console.log(profile.dominantTrait.label); // "Conscientiousness"
console.log(profile.validity.status);     // "high-consistency"
console.log(profile.onetClusters[0]);     // { id: "dependability-attention", score100: 89, ... }
console.log(profile.topRoleMatches[0]);   // { title: "Data Scientist / Quantitative Analyst", onetCode: "O*NET 15-2051.00", fitScore: 87, ... }
```

For shorter inventories (e.g., 20-item quick scans) or custom item pools, pass your own `IpipItem[]` array to `scoreIpipItems(items, answers, { missingPolicy: "omit" | "neutral" | "error" })`.

### 2. Score 4-Color Workstyle Quadrants & Compare Coworkers

Accepts an ordered array of choices, a `{ questionId: colorId }` map, or raw counts `{ crimson, amber, sage, slate }`:

```ts
import { scoreWorkColors, compareWorkColors } from "ipip-workplace-scorer";

const leadProfile = scoreWorkColors({
  crimson: 6, // Red · Fast-Paced x Task-Logic
  amber: 3,   // Yellow · Fast-Paced x People-Alignment
  sage: 1,    // Green · Methodical x People-Alignment
  slate: 2,   // Blue · Methodical x Task-Logic
});

console.log(leadProfile.primary.name); // "Crimson Driver"
console.log(leadProfile.percentages);  // { crimson: 50, amber: 25, sage: 8, slate: 17 } (sums strictly to 100)
console.log(leadProfile.coordX);       // -34 (-100 Task-Logic .. +100 People-Alignment)
console.log(leadProfile.coordY);       // +50 (-100 Methodical .. +100 Fast-Paced)

const partnerProfile = scoreWorkColors(["slate", "slate", "sage", "slate", "amber", "slate"]);
const synergy = compareWorkColors(leadProfile, partnerProfile);

console.log(synergy);
// {
//   synergyScore: 73,
//   samePrimary: false,
//   euclideanDistance: 116.02,
//   dominantAxisContrast: "tempo",
//   summary: "Complementary pairing (Crimson Driver + Slate Strategist) across tempo (73/100 synergy)."
// }
```

### 3. Score Conflict Modes, Team Roles & Squad Blind Spots

```ts
import {
  scoreConflictModes,
  scoreTeamRoles,
  scoreTeamDynamics,
} from "ipip-workplace-scorer";

const conflict = scoreConflictModes([
  "collaborative-integrator",
  "collaborative-integrator",
  "direct-challenger",
  "pragmatic-compromiser",
]);
// conflict.primary.name -> "Collaborative Integrator"
// conflict.assertivenessPct -> 82, conflict.cooperativenessPct -> 62

const roles = scoreTeamRoles({
  "action-driver": 5,
  "strategic-thinker": 4,
  "resource-spark": 3,
  "team-anchor": 2,
  "rigorous-finisher": 1,
});
// roles.primary.name -> "Action Driver", roles.coverageGapRole.name -> "Rigorous Finisher"

const squad = scoreTeamDynamics([
  {
    name: "PM",
    scores: { openness: 84, conscientiousness: 52, extraversion: 82, agreeableness: 64, "emotional-stability": 72 },
  },
  {
    name: "Tech Lead",
    scores: { openness: 78, conscientiousness: 56, extraversion: 78, agreeableness: 48, "emotional-stability": 74 },
  },
]);
// squad.blindSpotAlerts -> flags "Execution Closure Risk" and "Loudest-Voice Bias Risk"
```

---

## Psychometric Methodology

### 1. Public-Domain IPIP-50 Reverse Scoring & Normalization

Following Goldberg's (1992) lexical Big Five framework and the International Personality Item Pool (`ipip.ori.org`), each trait combines `5` positively keyed (`+`) statements and `5` reverse-keyed (`-`) statements on a `1–5` Likert scale:

```text
keyedScore(x) = x           if keyed == "+"
              = 6 - x       if keyed == "-"

score100      = round(((sum(keyedScore) - minRaw) / (maxRaw - minRaw)) * 100)
```

- **Adult Workplace Percentiles**: Approximated via the Abramowitz & Stegun standard normal CDF centered at empirical adult workplace midpoints (`mean = 54`, `sd = 18`, bounded `[1, 99]`).
- **Response Consistency & Straight-Lining Check**: `computeResponseValidity` computes raw Likert standard deviation (`stdDev`) and within-trait mean absolute deviation (`avgMad`) after reverse-keying. When `n >= 10` and `stdDev < 0.35` (for example, clicking `5` on every `+` and `-` statement), `straightLiningDetected` triggers `low-variance-caution`.

### 2. 4-Color 2×2 Behavioral Quadrant Geometry

Inspired by classic two-axis behavioral models (Tempo × Focus) and aligned mathematically to Big Five traits without proprietary trademarks:

- **`coordX` (Task-Logic vs. People-Alignment, `[-100, +100]`)**: `(amber + sage) - (crimson + slate)`
- **`coordY` (Methodical Depth vs. Fast-Paced Urgency, `[-100, +100]`)**: `(crimson + amber) - (slate + sage)`
- **Exact Sum-to-100 Normalization**: Integer percentages use Hamilton largest-remainder allocation (`largestRemainderPercentages`), eliminating rounding drift across arbitrary question counts.

### 3. Dual-Concern Conflict Grid & Team Composition

Conflict responses map across Blake & Mouton (1964) and Rahim (1983) dual-concern weights (`Assertiveness` vs. `Cooperativeness`) to compute primary mode, backup mode, composite coordinates, and nearest 2D grid zone (`gridZoneMode`). Multi-person `scoreTeamDynamics` computes group trait means, trait dispersion (`traitStdDev`), a `0–100` `cognitiveDiversityIndex`, and actionable blind-spot rules.

### 4. U.S. DOL O\*NET 31.0 Work Style Clusters & Role Vectors

`rankOnetWorkStyleClusters` weights Big Five scores into `7` O\*NET 31.0 Work Style domains (e.g., *Achievement & Persistence*, *Dependability & Attention to Detail*, *Self-Control & Stress Tolerance*, *Analytical Thinking & Innovation*). `rankOnetRoles` calculates weighted Root Mean Squared Error (`RMSE`) across `12` O\*NET-coded occupational profiles (`O*NET 15-1252.00`, `11-9041.00`, `15-2051.00`, etc.) to surface top-fit and stretch roles.

---

## Benchmark Comparison

| Capability | `ipip-workplace-scorer` + [Workplace Style Quiz](https://workplacestylequiz.com) | 16Personalities / MBTI-Style Apps | Truity@Work / CliftonStrengths / HIGH5 | CrystalKnows / Everything DiSC |
| :--- | :--- | :--- | :--- | :--- |
| **Scientific Foundation** | Open-science IPIP Big Five + O\*NET 31.0 Work Styles | 4-letter Jungian/MBTI type variants (or hybrid NERIS) | Proprietary trait/strength factor models | Proprietary DISC behavioral inference |
| **Scoring Transparency** | **100% open-source MIT formulas & reverse keys** | Closed proprietary algorithm | Closed proprietary scoring | Closed proprietary model |
| **Account / Login Wall** | **Zero registration required** | Email capture before/after share | Account + B2B admin portal required | Mandatory login / Chrome extension |
| **Programmatic Access** | **Zero-dependency TypeScript/ESM library** | No open scoring package | Enterprise API only | Enterprise SaaS (`$49/mo`–`$500/yr+`) |
| **Individual & Team Cost** | Open library (`MIT`); free online suite + optional `$19` / `$29` one-time Career Reports | Free summary + paid upgrades | `$19–$29` PDF / `$110+` 5-seat packs / `$59.99+` | `$49/mo` (`$490/yr`) or `$500/yr` team seat |
| **Data Privacy** | **Runs locally in Node or browser (no DB storage)** | Cloud profile storage | Cloud account tracking | Cloud profile & email scraping |

---

## API Reference

| Export | Kind | Description |
| :--- | :--- | :--- |
| `IPIP50_ITEMS` | `readonly IpipItem[]` | 50 balanced workplace Big Five items (`10` per factor, `5+ / 5-`). |
| `scoreIpip50(answers, options?)` | `Function` | Scores the 50-item inventory and attaches validity + O\*NET matches. |
| `scoreIpipItems(items, answers, options?)` | `Function` | Generic IPIP scorer for custom 20/50/60/120-item scales (`"error" \| "neutral" \| "omit"`). |
| `reverseLikert(value, min?, max?, allowDecimals?)` | `Function` | Strict reverse-scoring helper (`min + max - value`). |
| `normalizeRawScoreTo100(raw, count, min?, max?)` | `Function` | Exact `0–100` integer rescaling with bounds checks. |
| `estimateWorkplacePercentile(score100)` | `Function` | Abramowitz & Stegun adult workplace percentile (`1–99`). |
| `computeResponseValidity(items, answers, opts?)` | `Function` | Straight-lining and keyed-consistency diagnostics. |
| `scoreWorkColors(input)` | `Function` | 4-Color Workstyle percentages, `(coordX, coordY)` quadrant, and Big Five estimates. |
| `compareWorkColors(self, peer)` | `Function` | Pairwise 4-Color synergy score (`56–96`) and axis contrast summary. |
| `scoreConflictModes(input)` | `Function` | 5-mode dual-concern conflict scoring + Assertiveness/Cooperativeness coordinates. |
| `scoreTeamRoles(input)` | `Function` | 5-role functional team role percentages + coverage gap role. |
| `scoreTeamDynamics(members)` | `Function` | Multi-person (`2–12`) Big Five mean, spread, diversity index & blind-spot alerts. |
| `rankOnetWorkStyleClusters(scores)` | `Function` | Ranks 7 U.S. DOL O\*NET 31.0 Work Style clusters (`0–100`). |
| `rankOnetRoles(scores, topCount?)` | `Function` | Weighted RMSE ranking across 12 O\*NET-coded occupational profiles. |

---

## Development & Testing

`npm test` runs directly against Node's built-in test runner (`node:test`) with zero installed packages:

```bash
npm test
# or directly:
node --test
```

If modifying `src/index.ts`, install the lone TypeScript compiler devDependency to run strict typechecking and rebuild `dist/`:

```bash
npm install
npm run typecheck
npm run build
npm test
```

---

## Scientific Attribution & Licensing

- **Public-Domain IPIP Constructs**: Grounded in Goldberg, L. R. (1992) and the International Personality Item Pool ([ipip.ori.org](https://ipip.ori.org)).
- **O\*NET 31.0 Attribution**: Occupational work-style descriptors and SOC codes reference the U.S. Department of Labor, Employment and Training Administration O\*NET 31.0 database, used under **CC BY 4.0**.
- **Conflict Dual-Concern Literature**: Grounded in Blake & Mouton (1964) and Rahim (1983) organizational conflict frameworks.
- **Non-Affiliation & Educational Disclaimer**: All profiles and outputs are intended strictly for non-clinical workplace reflection, onboarding, and team communication workshops—never medical diagnosis or legally validated pre-employment screening. Not affiliated with, endorsed by, or a substitute for 16Personalities®, Truity®, CliftonStrengths® / Gallup®, HIGH5Test®, CrystalKnows®, Everything DiSC®, MBTI®, Belbin®, Insights Discovery®, True Colors®, Surrounded by Idiots®, or Thomas-Kilmann TKI®.

Licensed under the [MIT License](./LICENSE).

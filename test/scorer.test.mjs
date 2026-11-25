import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BIG_FIVE_TRAIT_ORDER,
  CONFLICT_MODE_ORDER,
  IPIP50_ITEMS,
  ONET_WORKPLACE_ROLES,
  ONET_WORK_STYLE_CLUSTERS,
  TEAM_ROLE_ORDER,
  WORK_COLOR_ORDER,
  compareWorkColors,
  estimateWorkplacePercentile,
  getBigFiveBand,
  normalizeRawScoreTo100,
  rankOnetRoles,
  rankOnetWorkStyleClusters,
  reverseLikert,
  scoreConflictModes,
  scoreIpip50,
  scoreIpipItems,
  scoreTeamDynamics,
  scoreTeamRoles,
  scoreWorkColors,
} from "../dist/index.js";

/** Helper to generate a complete 50-item IPIP answer map using per-trait keyed target ratings (1..5). */
function buildIpip50Answers(targetByTrait) {
  const answers = {};
  for (const item of IPIP50_ITEMS) {
    const desiredKeyedScore = targetByTrait[item.trait];
    answers[item.id] = item.keyed === "+" ? desiredKeyedScore : 6 - desiredKeyedScore;
  }
  return answers;
}

describe("IPIP-50 Big Five inventory & scoring", () => {
  it("contains exactly 50 balanced items (10 per trait, 5+ and 5-)", () => {
    assert.equal(IPIP50_ITEMS.length, 50);
    const seenIds = new Set(IPIP50_ITEMS.map((item) => item.id));
    assert.equal(seenIds.size, 50);

    for (const trait of BIG_FIVE_TRAIT_ORDER) {
      const traitItems = IPIP50_ITEMS.filter((item) => item.trait === trait);
      assert.equal(traitItems.length, 10);
      assert.equal(traitItems.filter((item) => item.keyed === "+").length, 5);
      assert.equal(traitItems.filter((item) => item.keyed === "-").length, 5);
    }
  });

  it("reverses Likert values accurately across standard and custom scales", () => {
    assert.equal(reverseLikert(1), 5);
    assert.equal(reverseLikert(2), 4);
    assert.equal(reverseLikert(3), 3);
    assert.equal(reverseLikert(4), 2);
    assert.equal(reverseLikert(5), 1);
    assert.equal(reverseLikert(2, 1, 7), 6);
  });

  it("normalizes raw scores linearly onto 0-100", () => {
    assert.equal(normalizeRawScoreTo100(10, 10), 0);
    assert.equal(normalizeRawScoreTo100(30, 10), 50);
    assert.equal(normalizeRawScoreTo100(50, 10), 100);
    assert.equal(normalizeRawScoreTo100(14, 4), 63);
  });

  it("scores maximum and minimum keyed IPIP-50 profiles to exact 100 and 0", () => {
    const maxAnswers = buildIpip50Answers({
      openness: 5,
      conscientiousness: 5,
      extraversion: 5,
      agreeableness: 5,
      "emotional-stability": 5,
    });
    const maxResult = scoreIpip50(maxAnswers);
    for (const dim of maxResult.dimensions) {
      assert.equal(dim.rawScore, 50);
      assert.equal(dim.score100, 100);
      assert.equal(dim.band, "high");
      assert.equal(dim.answeredCount, 10);
    }
    assert.equal(maxResult.validity.status, "high-consistency");
    assert.equal(maxResult.validity.straightLiningDetected, false);

    const minAnswers = buildIpip50Answers({
      openness: 1,
      conscientiousness: 1,
      extraversion: 1,
      agreeableness: 1,
      "emotional-stability": 1,
    });
    const minResult = scoreIpip50(minAnswers);
    for (const dim of minResult.dimensions) {
      assert.equal(dim.rawScore, 10);
      assert.equal(dim.score100, 0);
      assert.equal(dim.band, "low");
    }
    assert.equal(minResult.validity.status, "high-consistency");
  });

  it("cancels straight-lined raw responses to 50 and flags straight-lining caution", () => {
    const allFives = Object.fromEntries(IPIP50_ITEMS.map((item) => [item.id, 5]));
    const result = scoreIpip50(allFives);
    for (const dim of result.dimensions) {
      assert.equal(dim.rawScore, 30);
      assert.equal(dim.score100, 50);
      assert.equal(dim.band, "moderate");
    }
    assert.equal(result.validity.straightLiningDetected, true);
    assert.equal(result.validity.status, "low-variance-caution");
    assert.equal(result.validity.consistencyScore, 42);
    assert.equal(result.validity.responseStdDev, 0);
  });

  it("computes asymmetric reverse-scored trait totals, dominant traits, and O*NET alignments", () => {
    // Craft exact trait raw sums out of [10..50]
    const answers = buildIpip50Answers({
      openness: 4, // 40 raw -> 75
      conscientiousness: 5, // 50 raw -> 100
      extraversion: 2, // 20 raw -> 25
      agreeableness: 3, // 30 raw -> 50
      "emotional-stability": 4, // 40 raw -> 75
    });
    // Adjust one openness '-' item from 2 to 4 (keyed 2 instead of 4 -> -2 raw -> 38 raw -> ((38-10)/40)*100 = 70)
    answers.o2 = 4;
    // Adjust one conscientiousness '+' item from 5 to 4 (-1 raw -> 49 raw -> ((49-10)/40)*100 = 98)
    answers.c1 = 4;

    const result = scoreIpip50(answers);
    assert.equal(result.scoresByTrait.conscientiousness, 98);
    assert.equal(result.scoresByTrait["emotional-stability"], 75);
    assert.equal(result.scoresByTrait.openness, 70);
    assert.equal(result.scoresByTrait.agreeableness, 50);
    assert.equal(result.scoresByTrait.extraversion, 25);

    assert.equal(result.dominantTrait.key, "conscientiousness");
    assert.equal(result.secondaryTrait.key, "emotional-stability");
    assert.equal(getBigFiveBand(98), "high");
    assert.equal(getBigFiveBand(50), "moderate");
    assert.equal(getBigFiveBand(25), "low");
    assert.ok(estimateWorkplacePercentile(98) >= 95);
    assert.ok(estimateWorkplacePercentile(25) <= 10);

    assert.equal(result.onetClusters.length, ONET_WORK_STYLE_CLUSTERS.length);
    assert.ok(result.onetClusters[0].score100 >= result.onetClusters[1].score100);
    assert.equal(result.topRoleMatches.length, 4);
    assert.match(result.topRoleMatches[0].onetCode, /^O\*NET \d{2}-\d{4}\.\d{2}$/);
  });

  it("supports partial scoring policies when explicitly requested", () => {
    const partialAnswers = {
      o1: 5,
      o2: 1,
      c1: 4,
      c2: 2,
      e1: 3,
      e2: 3,
      a1: 4,
      a2: 2,
      s1: 5,
      s2: 1,
    };

    assert.throws(() => scoreIpip50(partialAnswers), RangeError);

    const omitted = scoreIpipItems(IPIP50_ITEMS, partialAnswers, {
      missingPolicy: "omit",
    });
    assert.equal(omitted.scoresByTrait.openness, 100);
    assert.equal(omitted.scoresByTrait.conscientiousness, 75);
    assert.equal(omitted.scoresByTrait.extraversion, 50);
    assert.equal(omitted.scoresByTrait.agreeableness, 75);
    assert.equal(omitted.scoresByTrait["emotional-stability"], 100);

    const neutralFilled = scoreIpipItems(IPIP50_ITEMS, partialAnswers, {
      missingPolicy: "neutral",
    });
    // 2 items at max (10) + 8 neutral items (24) = 34 -> (34-10)/40*100 = 60
    assert.equal(neutralFilled.scoresByTrait.openness, 60);
  });
});

describe("4-Color Workstyle quadrant scoring", () => {
  it("maps pure single-color profiles to exact 2D quadrant corners", () => {
    const crimson = scoreWorkColors(["crimson", "crimson", "crimson"]);
    assert.equal(crimson.primary.id, "crimson");
    assert.equal(crimson.coordX, -100);
    assert.equal(crimson.coordY, 100);
    assert.deepEqual(crimson.percentages, { crimson: 100, amber: 0, sage: 0, slate: 0 });

    const amber = scoreWorkColors(["amber"]);
    assert.equal(amber.primary.id, "amber");
    assert.equal(amber.coordX, 100);
    assert.equal(amber.coordY, 100);

    const sage = scoreWorkColors(["sage"]);
    assert.equal(sage.primary.id, "sage");
    assert.equal(sage.coordX, 100);
    assert.equal(sage.coordY, -100);

    const slate = scoreWorkColors(["slate"]);
    assert.equal(slate.primary.id, "slate");
    assert.equal(slate.coordX, -100);
    assert.equal(slate.coordY, -100);
  });

  it("guarantees largest-remainder percentages sum strictly to 100 and accepts counts/maps", () => {
    const fromCounts = scoreWorkColors({ crimson: 4, amber: 3, sage: 2, slate: 2 });
    const sum = WORK_COLOR_ORDER.reduce((acc, id) => acc + fromCounts.percentages[id], 0);
    assert.equal(sum, 100);
    assert.equal(fromCounts.primary.id, "crimson");
    assert.equal(fromCounts.secondary.id, "amber");
    // Percentages for 4/11, 3/11, 2/11, 2/11 -> 37, 27, 18, 18
    assert.deepEqual(fromCounts.percentages, { crimson: 37, amber: 27, sage: 18, slate: 18 });
    assert.equal(fromCounts.coordX, 27 + 18 - (37 + 18));
    assert.equal(fromCounts.coordY, 37 + 27 - (18 + 18));

    const fromQuestionMap = scoreWorkColors({
      wc1: "slate",
      wc2: "slate",
      wc3: "sage",
      wc4: "amber",
    });
    assert.equal(fromQuestionMap.primary.id, "slate");
    assert.deepEqual(fromQuestionMap.percentages, { crimson: 0, amber: 25, sage: 25, slate: 50 });
  });

  it("computes pairwise color synergy and contrast axis", () => {
    const driver = scoreWorkColors({ crimson: 8, amber: 2, sage: 1, slate: 1 });
    const anchor = scoreWorkColors({ crimson: 1, amber: 1, sage: 8, slate: 2 });
    const mirror = compareWorkColors(driver, driver);
    const opposite = compareWorkColors(driver, anchor);

    assert.equal(mirror.samePrimary, true);
    assert.equal(mirror.euclideanDistance, 0);
    assert.equal(mirror.dominantAxisContrast, "aligned");

    assert.equal(opposite.samePrimary, false);
    assert.ok(opposite.euclideanDistance > 100);
    assert.ok(opposite.synergyScore >= 56 && opposite.synergyScore <= 96);
  });
});

describe("Conflict modes, Team Roles, Team Dynamics & O*NET alignment", () => {
  it("scores dual-concern conflict modes and nearest 2D grid zone", () => {
    const integrator = scoreConflictModes([
      "collaborative-integrator",
      "collaborative-integrator",
      "pragmatic-compromiser",
    ]);
    assert.equal(integrator.primary.id, "collaborative-integrator");
    assert.equal(integrator.backup.id, "pragmatic-compromiser");
    assert.equal(integrator.gridZoneMode.id, "collaborative-integrator");
    assert.equal(integrator.assertivenessPct, Math.round((90 + 90 + 56) / 3));
    assert.equal(integrator.cooperativenessPct, Math.round((90 + 90 + 56) / 3));

    const pctSum = CONFLICT_MODE_ORDER.reduce((acc, k) => acc + integrator.percentages[k], 0);
    assert.equal(pctSum, 100);
  });

  it("scores functional team roles and highlights lowest coverage gap role", () => {
    const result = scoreTeamRoles({
      "action-driver": 5,
      "strategic-thinker": 4,
      "resource-spark": 2,
      "team-anchor": 1,
      "rigorous-finisher": 0,
    });
    assert.equal(result.primary.id, "action-driver");
    assert.equal(result.secondary.id, "strategic-thinker");
    assert.equal(result.coverageGapRole.id, "rigorous-finisher");
    const pctSum = TEAM_ROLE_ORDER.reduce((acc, k) => acc + result.percentages[k], 0);
    assert.equal(pctSum, 100);
  });

  it("detects multi-person team blind spots and ranks O*NET work styles & roles", () => {
    const team = scoreTeamDynamics([
      {
        name: "Alice",
        scores: { openness: 85, conscientiousness: 45, extraversion: 82, agreeableness: 60, "emotional-stability": 70 },
      },
      {
        name: "Bob",
        scores: { openness: 78, conscientiousness: 52, extraversion: 88, agreeableness: 55, "emotional-stability": 65 },
      },
    ]);
    assert.equal(team.memberCount, 2);
    assert.ok(team.blindSpotAlerts.some((msg) => msg.includes("Execution Closure Risk")));
    assert.ok(team.blindSpotAlerts.some((msg) => msg.includes("Loudest-Voice Bias Risk")));

    const roleRank = rankOnetRoles({
      openness: 52,
      conscientiousness: 88,
      extraversion: 58,
      agreeableness: 62,
      "emotional-stability": 76,
    });
    assert.equal(roleRank.allMatches.length, ONET_WORKPLACE_ROLES.length);
    assert.equal(roleRank.topMatches[0].slug, "operations-revops-lead");

    const clusters = rankOnetWorkStyleClusters({
      openness: 52,
      conscientiousness: 88,
      extraversion: 58,
      agreeableness: 62,
      "emotional-stability": 76,
    });
    assert.equal(clusters[0].id, "dependability-attention");
  });
});

describe("Invalid input handling", () => {
  it("rejects non-object, empty, out-of-range, non-integer, and NaN Likert inputs", () => {
    assert.throws(() => scoreIpip50(null), TypeError);
    assert.throws(() => scoreIpip50([]), TypeError);
    assert.throws(() => scoreIpip50("not-an-object"), TypeError);

    assert.throws(() => scoreIpip50({}), RangeError);
    assert.throws(() => scoreIpip50({ nonexistent: 3 }), RangeError);
    assert.throws(() => scoreIpip50({ o1: 0 }), RangeError);
    assert.throws(() => scoreIpip50({ o1: 6 }), RangeError);
    assert.throws(() => scoreIpip50({ o1: 3.5 }), RangeError);
    assert.throws(() => scoreIpip50({ o1: Number.NaN }), RangeError);
    assert.throws(() => scoreIpip50({ o1: "5" }), RangeError);

    assert.throws(() => reverseLikert(0), RangeError);
    assert.throws(() => reverseLikert(6), RangeError);
    assert.throws(() => reverseLikert(2.5), RangeError);
    assert.throws(() => reverseLikert(3, 5, 1), RangeError);
    assert.throws(() => normalizeRawScoreTo100(55, 10), RangeError);
    assert.throws(() => getBigFiveBand(101), RangeError);
    assert.throws(() => estimateWorkplacePercentile(-1), RangeError);
  });

  it("rejects invalid WorkColor, ConflictMode, TeamRole, TeamDynamics, and O*NET inputs", () => {
    assert.throws(() => scoreWorkColors([]), RangeError);
    assert.throws(() => scoreWorkColors({}), RangeError);
    assert.throws(() => scoreWorkColors(["purple"]), RangeError);
    assert.throws(() => scoreWorkColors({ q1: "orange" }), RangeError);
    assert.throws(() => scoreWorkColors({ crimson: -1, amber: 4 }), RangeError);
    assert.throws(() => scoreWorkColors({ crimson: 0, amber: 0, sage: 0, slate: 0 }), RangeError);

    assert.throws(() => scoreConflictModes([]), RangeError);
    assert.throws(() => scoreConflictModes(["aggressive"]), RangeError);
    assert.throws(() => scoreTeamRoles({ q1: "unknown-role" }), RangeError);

    assert.throws(
      () =>
        scoreTeamDynamics([
          {
            name: "OnlyOne",
            scores: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, "emotional-stability": 50 },
          },
        ]),
      RangeError
    );

    assert.throws(
      () =>
        rankOnetRoles({
          openness: 105,
          conscientiousness: 50,
          extraversion: 50,
          agreeableness: 50,
          "emotional-stability": 50,
        }),
      RangeError
    );
  });
});

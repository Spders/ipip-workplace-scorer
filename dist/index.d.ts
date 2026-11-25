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
/** Canonical keys for the five Big Five (OCEAN) workplace dimensions. */
export type BigFiveTraitKey = "openness" | "conscientiousness" | "extraversion" | "agreeableness" | "emotional-stability";
/** Qualitative score band derived from a 0-100 normalized score. */
export type ScoreBand = "low" | "moderate" | "high";
/** Keying direction for Likert items ("+" = direct scored, "-" = reverse scored). */
export type ItemKeyDirection = "+" | "-";
/** Canonical ordered list of the five Big Five trait keys. */
export declare const BIG_FIVE_TRAIT_ORDER: readonly BigFiveTraitKey[];
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
/** Domain descriptions for the five Big Five dimensions. */
export declare const IPIP50_TRAIT_METADATA: Record<BigFiveTraitKey, {
    label: string;
    ipipFactor: string;
    highSummary: string;
    moderateSummary: string;
    lowSummary: string;
}>;
/**
 * 50 balanced workplace-adapted Big Five factor markers (10 items per factor; 5 '+' and 5 '-' per factor)
 * grounded in Goldberg's (1992) public-domain IPIP architecture (ipip.ori.org).
 */
export declare const IPIP50_ITEMS: readonly IpipItem[];
/**
 * Reverses a negatively keyed Likert item rating using `(scaleMin + scaleMax) - value`
 * (for a standard 1-5 scale: `6 - value`).
 */
export declare function reverseLikert(value: number, scaleMin?: number, scaleMax?: number, allowDecimals?: boolean): number;
/**
 * Linearly normalizes a raw trait sum onto a 0-100 integer scale:
 * `Math.round(((rawScore - minRaw) / (maxRaw - minRaw)) * 100)`.
 */
export declare function normalizeRawScoreTo100(rawScore: number, itemCount: number, scaleMin?: number, scaleMax?: number): number;
/** Maps a 0-100 score onto qualitative low / moderate / high interpretation bands. */
export declare function getBigFiveBand(score100: number): ScoreBand;
/**
 * Abramowitz & Stegun standard normal CDF approximation mapping 0-100 scores onto
 * adult workplace percentile benchmarks (centered at mean = 54, sd = 18, clamped 1..99).
 */
export declare function estimateWorkplacePercentile(score100: number): number;
/**
 * Evaluates raw response variance and within-trait positive vs reverse-keyed agreement
 * to detect straight-lining (e.g., clicking 3 or 5 across all '+' and '-' items).
 */
export declare function computeResponseValidity(items: readonly IpipItem[], answers: Record<string, number>, options?: Pick<IpipScoringOptions, "scaleMin" | "scaleMax" | "allowDecimals">): ResponseValidityReport;
/**
 * Scores an arbitrary array of IPIP items (such as IPIP-50, IPIP-20, or custom subscales)
 * with reverse-keyed inversion, strict validation, 0-100 normalization, and O*NET 31.0 mapping.
 */
export declare function scoreIpipItems(items: readonly IpipItem[], answers: Record<string, number>, options?: IpipScoringOptions): IpipEvaluationResult;
/**
 * Convenience wrapper scoring the built-in 50-item public-domain IPIP-50 workplace marker inventory
 * (`o1..o10`, `c1..c10`, `e1..e10`, `a1..a10`, `s1..s10`).
 */
export declare function scoreIpip50(answers: Record<string, number>, options?: IpipScoringOptions): IpipEvaluationResult;
/** Trademark-clean 4-color workplace profile identifiers. */
export type WorkColorId = "crimson" | "amber" | "sage" | "slate";
/** Canonical evaluation order for tie-breaking and iteration. */
export declare const WORK_COLOR_ORDER: readonly WorkColorId[];
export declare const WORK_COLOR_DISCLAIMER = "Independent educational model aligned with public-domain IPIP Big Five constructs. Not affiliated with or endorsed by Insights Discovery(R), True Colors(R), Everything DiSC(R), or Surrounded by Idiots(R).";
export interface WorkColorProfile {
    readonly id: WorkColorId;
    readonly slug: string;
    readonly colorLabel: string;
    readonly name: string;
    readonly quadrant: string;
    readonly bigFiveAnchor: string;
    readonly summary: string;
}
export declare const WORK_COLOR_PROFILES: Record<WorkColorId, WorkColorProfile>;
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
export declare function scoreWorkColors(input: readonly WorkColorId[] | Record<string, WorkColorId> | Partial<Record<WorkColorId, number>>): WorkColorScoreResult;
/** Computes pairwise collaboration synergy and quadrant contrast between two 4-Color results. */
export declare function compareWorkColors(self: WorkColorScoreResult, peer: WorkColorScoreResult): WorkColorComparisonResult;
/** Five workplace conflict management modes grounded in dual-concern literature. */
export type ConflictModeId = "collaborative-integrator" | "direct-challenger" | "pragmatic-compromiser" | "diplomatic-harmonizer" | "strategic-de-escalator";
export declare const CONFLICT_MODE_ORDER: readonly ConflictModeId[];
export interface ConflictModeProfile {
    readonly id: ConflictModeId;
    readonly name: string;
    readonly shortLabel: string;
    readonly assertivenessWeight: number;
    readonly cooperativenessWeight: number;
    readonly zoneLabel: string;
}
export declare const CONFLICT_MODE_PROFILES: Record<ConflictModeId, ConflictModeProfile>;
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
export declare function scoreConflictModes(input: readonly ConflictModeId[] | Record<string, ConflictModeId> | Partial<Record<ConflictModeId, number>>): ConflictScoreResult;
/** Five functional squad role identifiers aligned with Big Five team composition research. */
export type TeamRoleId = "action-driver" | "strategic-thinker" | "team-anchor" | "resource-spark" | "rigorous-finisher";
export declare const TEAM_ROLE_ORDER: readonly TeamRoleId[];
export interface TeamRoleProfile {
    readonly id: TeamRoleId;
    readonly slug: string;
    readonly name: string;
    readonly subtitle: string;
    readonly bigFiveSignature: string;
}
export declare const TEAM_ROLE_PROFILES: Record<TeamRoleId, TeamRoleProfile>;
export interface TeamRoleScoreResult {
    primary: TeamRoleProfile;
    secondary: TeamRoleProfile;
    coverageGapRole: TeamRoleProfile;
    percentages: Record<TeamRoleId, number>;
    counts: Record<TeamRoleId, number>;
    totalResponses: number;
}
/** Scores functional team role responses and identifies primary, backup, and gap roles. */
export declare function scoreTeamRoles(input: readonly TeamRoleId[] | Record<string, TeamRoleId> | Partial<Record<TeamRoleId, number>>): TeamRoleScoreResult;
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
export declare function scoreTeamDynamics(members: readonly TeamMemberProfile[]): TeamDynamicsSummary;
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
export declare const ONET_WORK_STYLE_CLUSTERS: readonly OnetWorkStyleClusterDefinition[];
export interface OnetRoleVector {
    readonly slug: string;
    readonly title: string;
    readonly family: string;
    readonly onetCode: string;
    readonly idealScores: BigFiveScores;
    readonly weights: BigFiveScores;
}
/** 12 O*NET 31.0-referenced occupational benchmark vectors for educational role-fit reflection. */
export declare const ONET_WORKPLACE_ROLES: readonly OnetRoleVector[];
/**
 * Ranks the 7 O*NET 31.0 Work Style clusters against a user's 0-100 Big Five scores.
 */
export declare function rankOnetWorkStyleClusters(scores: BigFiveScores): OnetWorkStyleClusterMatch[];
/**
 * Ranks the 12 O*NET 31.0 workplace role vectors by weighted RMSE proximity to a 0-100 Big Five profile.
 */
export declare function rankOnetRoles(scores: BigFiveScores, topCount?: number): {
    topMatches: OnetRoleMatch[];
    stretchMatch: OnetRoleMatch;
    allMatches: OnetRoleMatch[];
};

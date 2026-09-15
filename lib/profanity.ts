import "server-only";
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedBlacklistMatcherTransformers,
  englishRecommendedWhitelistMatcherTransformers,
  skipNonAlphabeticTransformer,
} from "obscenity";
import { normalizeUsername } from "./username";

// Single centralized profanity check for the whole app — every place that
// needs to reject an inappropriate username (or, later, any other
// user-chosen text) calls containsProfanity() here rather than keeping its
// own word list. Obscenity's English preset is word-boundary aware (it
// does not flag "banal" or "the pen is" just because a bad word is a
// substring) and its recommended transformers already normalize common
// bypasses — leetspeak substitutions (w0rd) and repeated/confusable
// characters — before matching.
//
// Two matchers, checked together, because a single one can't catch both
// underscore-bypass shapes at once (verified empirically — see
// lib/profanity.ts test notes in the chapter this was written in):
//  - `fragmentMatcher` adds skipNonAlphabeticTransformer, which makes it
//    treat "fu_ck" as "fuck" by erasing the underscore entirely — but
//    erasing it also erases the underscore's role as a word BOUNDARY, so
//    a fully-separated bad word glued to other text on the outside (e.g.
//    "store_shit_promo") stops looking bounded at either end and slips
//    past the library's own word-boundary-anchored patterns.
//  - `boundedMatcher` has no skip transformer, and instead runs against
//    the text with underscores replaced by real spaces — which keeps
//    "store_shit_promo" looking like the three separate words it visibly
//    is ("store shit promo"), so the library's normal word-boundary
//    matching catches "shit" cleanly. This pass alone can't catch
//    "fu_ck" (splits into "fu"/"ck", neither profane alone), which is
//    exactly what fragmentMatcher is for.
// Underscore is the only separator this ever needs to handle: the
// username format check (lib/username.ts, [a-zA-Z0-9_] only) already runs
// before this, rejecting spaces/periods/other punctuation outright.
const fragmentMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  blacklistMatcherTransformers: [...englishRecommendedBlacklistMatcherTransformers, skipNonAlphabeticTransformer()],
  whitelistMatcherTransformers: englishRecommendedWhitelistMatcherTransformers,
});
const boundedMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  blacklistMatcherTransformers: [...englishRecommendedBlacklistMatcherTransformers],
  whitelistMatcherTransformers: englishRecommendedWhitelistMatcherTransformers,
});

/** True if `text` contains profanity/slurs/sexual terms per the shared
 *  matchers. Callers should run this against an already-normalized form of
 *  user input (e.g. the lowercased username) — see lib/username.ts. */
export function containsProfanity(text: string): boolean {
  return fragmentMatcher.hasMatch(text) || boundedMatcher.hasMatch(text.replace(/_/g, " "));
}

/** Server-only username appropriateness check — deliberately kept out of
 *  lib/username.ts (which lib/clientValidation.ts also imports for
 *  instant-feedback format checks in the browser): the word list this
 *  pulls in must never ship in the client bundle, and profanity checking
 *  is authoritative server-side only anyway (see lib/validation.ts). Runs
 *  against the canonical normalized form (trimmed + lowercased) — the same
 *  form uniqueness is keyed on — so "BadWord", "badword" and " BadWord "
 *  are all judged identically. */
export function isUsernameAppropriate(raw: string): boolean {
  return !containsProfanity(normalizeUsername(raw));
}

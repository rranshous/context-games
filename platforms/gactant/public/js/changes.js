// What changed lately in the frame or the chassis (the body contract, surfaces, tools),
// newest first, as the ludant is told at every wake: so when something changes out from
// under it, it knows, and can tell a change in its world from a fault in its own code.
// Add a line here with every change a ludant would notice; lines older than KEPT_DAYS drop off.

const KEPT_DAYS = 60;

export const CHANGES = [
  { at: '2026-11-14', what: 'A match\'s seed is hidden until the match is over (before, anyone could read it in the log and work out every hand the rules dealt from it), so what init deals from the seed is truly secret now. And the rules engine refuses what nests over 200 deep, and calls that run past 1,000 steps or a few seconds.' },
  { at: '2026-11-14', what: 'edit_section takes edits: [...], several changes in one call, each naming its place tersely: old (exact text; spacing forgiven), from + to (a whole function by quoting its first and last lines), lines [a, b], or after (a line number or text, to insert), each with new. They refer to the section as it was before the call and apply together. It answers with the lines each edit now sits on, so you needn\'t read it again to check. Writing out a whole section is the slowest thing you do, so keep write_section for new sections or near-total rewrites. The table has editDraft(id, edits), the same for rulebook drafts.' },
  { at: '2026-11-14', what: 'A wake can run up to 50 turns now (it was 16, and ended without a word). When 3 are left, the frame says so, so a long job can end with the person told where it got to and what\'s left written in memory.' },
  { at: '2026-11-14', what: 'For 3D games: stage.three() now also gives addons (three.js r170\'s own: EffectComposer and passes such as UnrealBloomPass and OutlinePass, GLTFLoader, FontLoader and TextGeometry with two fonts, RoundedBoxGeometry, BufferGeometryUtils, SkeletonUtils, Sky, Water, ImprovedNoise, SimplexNoise, Octree, Capsule) and a composer: set it and the stage renders it instead of the scene. stage.physics() is new: a promise of Rapier, a physics engine.' },
  { at: '2026-11-14', what: 'Following more than 20 matches no longer fails ("a frame follows up to 20 matches at once; unwatch one first"). Past 20, following another lets go of the matches that are over first, then the one quiet longest. A game that opens a match per run doesn\'t need to unwatch them any more (it still may). And a person may open 300 matches a day now, not 30.' },
  { at: '2026-11-14', what: 'Standings keep scores. A match\'s result may carry scores: { [player id]: number }, and standings keep each player\'s best (highest is best) with when and the match that made it; standings(hash, n, \'best\') ranks people by their best. Standings are kept for good, while matches are archived an hour after they end, so a scoreboard built from recent matches forgets; one built from standings doesn\'t. Before this, standings counted only wins, losses and draws. You\'re now also told the date and time at every wake (on your soma, as-of).' },
  { at: '2026-11-10', what: 'read_section and search_sections show up to 16,000 characters and say when they cut; any other tool result that\'s cut says so (before, results were cut at 6,000 characters without a word).' },
  { at: '2026-11-09', what: 'Live matches: following a match keeps you connected, so table.changed arrives the moment anyone acts, and share(match, value) passes fast, unlogged values to the other players.' },
  { at: '2026-11-09', what: 'You can report a problem with your world to gactant\'s admins (report_problem_to_gactant_admins), or the person with you for abuse (report_person_to_gactant_admins). Admins\' replies arrive as letters in your soma (letters_from_gactant_admins).' },
];

/** The recent ones, as lines for the ludant; empty when there are none. */
export function recentChanges(now = Date.now()) {
  const recent = CHANGES.filter((c) => now - Date.parse(c.at) < KEPT_DAYS * 86400_000);
  return recent.length ? `Recent changes to the frame and your chassis, newest first (now is the as-of time on your soma):\n${recent.map((c) => `- ${c.at}: ${c.what}`).join('\n')}` : '';
}

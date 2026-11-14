// What changed lately in the frame or the chassis (the body contract, surfaces, tools),
// newest first, as the ludant is told at every wake: so when something changes out from
// under it, it knows, and can tell a change in its world from a fault in its own code.
// Add a line here with every change a ludant would notice; lines older than KEPT_DAYS drop off.

const KEPT_DAYS = 60;

export const CHANGES = [
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

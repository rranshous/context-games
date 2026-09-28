// Public facts of the universe the dungeon uses for its enemies. No secrets: anyone can recompute these.

/** The hearth-god's address: known to everyone since before the first scholar. */
export const HEARTH_GOD = '011010';

/** The ancient layer: every spirit at depth 6 (full scan, see journal). Charted since before scholars. */
export const ANCIENTS = [
  '005420', '011010', '027345', '033121', '050465', '076656', '110062', '111553', '136143', '162033', '171163', '226140',
  '233244', '242411', '253312', '303562', '305652', '371744', '375267', '427477', '431411', '446507', '473750', '507114',
  '547533', '567171', '570476', '600212', '615043', '651063', '677662', '701422', '742340', '755517', '757057',
];

/** The mightiest ancients (magnitude >= 2), whom Wardens call upon. */
export const WARDEN_WELLS = ['011010', '567171', '570476', '615043', '651063'];

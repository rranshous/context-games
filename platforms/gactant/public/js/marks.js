// Marks: proof of what a person contributed to a ludant (surfaces/made.js makes them, core.mjs
// keeps them, mark.html checks one). The same text is signed in the browser and checked on
// the server.

/** What a device signs to mark a contribution: the ludant, and the fingerprint. */
export const markText = (ludant, hash) => `gactant.mark.v1.${ludant}.${hash}`;

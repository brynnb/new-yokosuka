// Original opening page order and facts, with lightly adapted English wording.
// Source: Force Vector's Shenmue Notebook Guide, pages 1–5:
// https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/14458
// This is a bounded transcription, not a recovered native notebook flag table.
// Master Chen's number and the allowance/Fuku-san clues are later additions.
export const OPENING_NOTEBOOK_PAGES = Object.freeze([
  Object.freeze({
    id: "opening-phone-services",
    text: "Phone numbers\n\nPolice — 110\nFire — 119\nWeather forecast — 177\nDirectory assistance — 104",
  }),
  Object.freeze({
    id: "opening-phone-home",
    text: "Phone numbers\n\nHazuki Dojo / Home\n0468-37-7424",
  }),
  Object.freeze({
    id: "opening-phone-friends",
    text: "Naoyuki Ito\n0468-37-7492\n\nNozomi Harasaki\n0468-22-5508",
  }),
  Object.freeze({
    id: "opening-lan-di",
    text: "The dragon mirror was stolen.\n\nLan Di killed my father.\nHe wore a robe with a dragon on it.\nAn unusual fighting style.\nA tattoo on his arm.",
  }),
  Object.freeze({
    id: "opening-meng-cun",
    text: "Did Dad kill Zhao Sun Ming\nin Meng Cun?\n\nWhat really happened at the dojo that day?",
  }),
]);

const EMPTY_PAGES = Object.freeze([]);
const ALLOWANCE_PAGE = Object.freeze({
  id: "story-first-allowance",
  text: "Ine-san leaves ¥500 on the shoe cabinet each day.\n\nVisit Fuku-san at the dojo.",
});
const STORY_PAGES = Object.freeze([
  { flag: "notebook.s1.allowance", page: ALLOWANCE_PAGE },
  { flag: "notebook.s1.men-in-black", page: Object.freeze({ id: "story-men-in-black",
    text: "Ask around to find out whether anyone saw men wearing black on the day of the attack." }) },
  { flag: "notebook.s1.black-car", page: Object.freeze({ id: "story-black-car",
    text: "Megumi's sister saw a big black car on the rainy day of the attack.\n\nAsk about the black car." }) },
  { flag: "notebook.s1.yamagishi-witness", page: Object.freeze({ id: "story-yamagishi-witness",
    text: "Yamagishi-san was nearly hit by the black car. He hurt himself when he fell.\n\nVisit him at home in Sakuragaoka, near the candy shop." }) },
]);

export function notebookPagesForCharacter(character) {
  // The server saves openingCompleted independently in each play context.
  // Deriving these immutable pages also fills older completed Story saves,
  // without a second save system or replaying/duplicating notebook writes.
  return character?.id != null
    && character.playMode === "story"
    && character.openingCompleted === true
    ? [...OPENING_NOTEBOOK_PAGES, ...STORY_PAGES.filter(entry => character.storyFlags?.[entry.flag] === true).map(entry => entry.page)]
    : EMPTY_PAGES;
}

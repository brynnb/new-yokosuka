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
  { flag: "notebook.s1.dobuita-black-car", page: Object.freeze({ id: "story-dobuita-black-car",
    text: "The black car went toward Dobuita.\n\nAsk the people who work in the shopping district." }) },
  { flag: "notebook.s1.tom-witness", page: Object.freeze({ id: "story-tom-witness",
    text: "The black car splashed Nozomi with mud.\n\nTom argued with the people in the car. Ask him at the hot dog truck." }) },
  { flag: "notebook.s1.chinese-community", page: Object.freeze({ id: "story-chinese-community",
    text: "Tom saw a man in a deep-green Chinese coat. Lan Di.\n\nAsk the Chinese community in Dobuita for information. Visit Tao-san at Ajiichi, opposite Hattori Sporting Goods, from 10 a.m." }) },
  { flag: "notebook.s1.three-blades", page: Object.freeze({ id: "story-three-blades",
    text: "The Three Blades: barbers, tailors and cooks.\n\nAsk Maeda-san at the barber shop near You Arcade, Itoi-san at Mary's Patches, or the cook at Manpukuken Ramen." }) },
  { flag: "notebook.s1.yong-wu", page: Object.freeze({ id:"story-yong-wu",
    text:"Junko at Manpukuken Ramen knows two former Three Blades: Yong-san and Wu-san.\n\nLook for them in Dobuita's bars at night." }) },
  { flag: "notebook.s1.liu-barber", page: Object.freeze({ id: "story-liu-barber",
    text: "Visit Liu Barber and Hair Salon, past Funny Bear Burgers toward Sakuragaoka.\n\nThe shop is open from 10 a.m. to 7 p.m." }) },
  { flag: "notebook.s1.liu-senior", page: Object.freeze({ id: "story-liu-senior",
    text: "Liu-san's father is a first-generation Chinese. He may know about Lan Di.\n\nLook in Suzume Park, in the alley next to You Arcade." }) },
  { flag: "notebook.s1.sailors", page: Object.freeze({ id: "story-sailors",
    text: "Lan Di may be connected to a Chinese cartel based at the harbor.\n\nAsk sailors who travel to Hong Kong or Shanghai. Look in Dobuita's bars at night." }) },
  { flag:"notebook.s1.heartbeats",page:Object.freeze({id:"story-heartbeats",
    text:"Saijo-san says sailors visit MJQ Jazz Bar and Heartbeats.\n\nHeartbeats is in the alley across from Knocking Motorcycle Shop. Go after 7 p.m. and be careful."}) },
  { flag:"notebook.s1.charlie",page:Object.freeze({id:"story-charlie",
    text:"Hato at Heartbeats told me about Charlie.\n\nHe deals in smuggled goods and may know about the Chinese cartel. Shades, a black leather jacket, and a tattoo on his arm.\n\nAsk at Knocking Motorcycle Shop."}) },
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

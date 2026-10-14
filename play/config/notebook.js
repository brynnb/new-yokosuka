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
  { flag:"notebook.s1.charlie-jackets",page:Object.freeze({id:"story-charlie-jackets",
    text:"Ono-san says Charlie sometimes visits Tsuruoka-san at Jupitor's Jackets.\n\nAsk Tsuruoka-san or Kurita-san at the military surplus shop."}) },
  { flag:"notebook.s1.nagai-industries",page:Object.freeze({id:"story-nagai-industries",
    text:"Kinuyo-san has heard that people with tattoos visit Nagai Industries.\n\nLook past Lapis Fortune Teller, near the bars. The office opens at 1 p.m. Be careful."}) },
  { flag:"notebook.s1.nagai-younger-men",page:Object.freeze({id:"story-nagai-younger-men",
    text:"Nagai-san doesn't know Charlie.\n\nAsk the younger men in the upstairs office."}) },
  { flag:"notebook.s1.toshiki-charlie",page:Object.freeze({id:"story-toshiki-charlie",
    text:"Hasegawa-san has seen Charlie around at night.\n\nAsk Toshiki in the same office for details."}) },
  { flag:"notebook.s1.charlie-hangouts",page:Object.freeze({id:"story-charlie-hangouts",
    text:"Toshiki says Charlie hangs around Kurita Military Surplus and Jupitor's Jackets in Dobuita at night.\n\nAsk the shopkeepers when they last saw him."}) },
  { flag:"notebook.s1.charlie-evening",page:Object.freeze({id:"story-charlie-evening",
    text:"Charlie was seen around the jacket shop at about 7 p.m.\n\nLook around Dobuita in the evening. Be alert near You Arcade."}) },
  { flag:"notebook.s1.tattoo-parlor",page:Object.freeze({id:"story-tattoo-parlor",
    text:"Charlie's friends ambushed me in the parking lot.\n\nTony says there is a tattoo parlor in Yokosuka. If Charlie had his tattoo done here, someone there may know him.\n\nFind the tattoo parlor."}) },
  { flag:"notebook.s1.okayama-heights",page:Object.freeze({id:"story-okayama-heights",
    text:"Saijo-san says Takashiro runs the tattoo parlor in Okayama Heights.\n\nThe apartments are across from Bar Yokosuka in Dobuita."}) },
  { flag:"notebook.s1.okayama-second-floor",page:Object.freeze({id:"story-okayama-second-floor",
    text:"Kurita-san lives in room 102 at Okayama Heights. The tattoo parlor must be in one of the upstairs rooms.\n\nLook for the marked door on the second floor."}) },
  { flag:"notebook.s1.charlie-return-tomorrow",page:Object.freeze({id:"story-charlie-return-tomorrow",
    text:"Takashiro told me to come back tomorrow. Charlie might be at the tattoo parlor.\n\nReturn to Okayama Heights on a later day, after the parlor opens at 2 p.m."}) },
  { flag:"notebook.s1.charlie-cartel-appointment",page:Object.freeze({id:"story-charlie-cartel-appointment",
    text:"Charlie promised to arrange a meeting with members of the Chinese cartel.\n\nMeet him at You Arcade at 3 p.m. on the following day.\n\nI warned him not to break his word."}) },
  { flag:"notebook.s1.nozomi-worried",page:Object.freeze({id:"story-nozomi-worried",
    text:"Nozomi came looking for me near Okayama Heights.\n\nShe seems worried about me and my entrance exams. I promised we'd talk later."}) },
  { flag:"notebook.s1.chinese-letter",page:Object.freeze({id:"story-chinese-letter",
    text:"Ine-san gave me a mysterious letter addressed to my father.\n\nIt's written in Chinese. Find someone who can read it."}) },
  {flag:"notebook.s1.gao-wen",page:Object.freeze({id:"story-gao-wen",text:"Saved a Chinese boy named Gao Wen from Charlie's gang.\n\nCharlie's cartel meeting was a trap. The Chinese letter is my remaining lead. Find someone who can read it."})},
  {flag:"notebook.s1.russiya-translator",page:Object.freeze({id:"story-russiya-translator",text:"Gao Wen's grandmother, Xia Xiu Yu, can read Chinese.\n\nVisit her at Russiya China Shop in Dobuita, near the fortune teller."})},
  {flag:"notebook.s1.translated-letter",page:Object.freeze({id:"story-translated-letter",text:"Xia-san read the reversed Chinese characters.\n\nBeware of those who pursue the mirror. If I need help, seek Master Chen.\n\nSigned: Zhu Yuan Da."})},
  {flag:"notebook.s1.translated-letter",page:Object.freeze({id:"story-letter-passwords",text:"On the back of the letter:\nFather's Heaven · Nine Dragons\nMother's Earth · Comrades\n\nMaster Chen: 0468-61-5647\nCall from a telephone to find the next lead."})},
  {flag:"notebook.s1.warehouse-eight-phone",page:Object.freeze({id:"story-warehouse-eight-phone",text:"The words in the letter were telephone passwords.\n\nFather's Heaven ↔ Nine Dragons\nMother's Earth ↔ Comrades\n\nThe man said Warehouse No. 8. Look up the number's 61 prefix in the telephone directory near the tobacco shop in Dobuita."})},
  {flag:"notebook.s1.amihama",page:Object.freeze({id:"story-amihama",text:"The telephone directory lists the 61 prefix in Amihama.\n\nLook for Warehouse No. 8 in New Yokosuka Harbor. Take the bus near the tobacco shop in Dobuita."})},
  {flag:"notebook.s1.goro-directions",page:Object.freeze({id:"story-goro-harbor",text:"Goro gave me directions to Warehouse No. 8.\n\nFollow the street into the New Warehouse District, then turn right."})},
  {flag:"notebook.s1.warehouse-eight-rear",page:Object.freeze({id:"story-warehouse-eight-rear",text:"The guard won't let me enter Warehouse No. 8.\n\nLook for another way in around the back."})},
  {flag:"notebook.s1.old-warehouse-eight",page:Object.freeze({id:"story-old-warehouse-eight",text:"There are two Warehouse No. 8s.\n\nThe workers mentioned another one in the Old Warehouse District. That's where I should look."})},
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

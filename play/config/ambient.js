const MUSIC_BASE =
  "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/shenmue/music";

function ambientTrack(bank, label) {
  const id = bank.toLowerCase();
  return Object.freeze({
    url: `${MUSIC_BASE}/${id}.ogg`,
    label: `${label} (${bank})`,
    loop: true,
  });
}

export const AMBIENT_MANIFEST = Object.freeze({
  tracks: Object.freeze({
    amb013: ambientTrack("AMB013", "New Yokosuka Harbor"),
    amb015: ambientTrack("AMB015", "Old Warehouse District"),
    amb018: ambientTrack("AMB018", "Yamanose"),
    amb019: ambientTrack("AMB019", "Sakuragaoka"),
    amb022: ambientTrack("AMB022", "Dobuita"),
    amb023: ambientTrack("AMB023", "Antique Shop"),
    amb028: ambientTrack("AMB028", "Tomato Convenience Store"),
    amb032: ambientTrack("AMB032", "Ajiichi Chinese Restaurant"),
    amb037: ambientTrack("AMB037", "Hazuki Residence Interior"),
    amb042: ambientTrack("AMB042", "Slot House"),
    amb043: ambientTrack("AMB043", "MJQ Jazz Bar and Dobuita Bars"),
  }),
  worlds: Object.freeze({
    exterior: Object.freeze({ track: "amb037", gain: 1 }),
    interior: Object.freeze({ track: "amb037", gain: 1 }),
    yamanose: Object.freeze({ track: "amb018", gain: 1 }),
    sakuragaoka: Object.freeze({ track: "amb019", gain: 1 }),
    dobuita: Object.freeze({ track: "amb022", gain: 1 }),
    dkty: Object.freeze({ track: "amb023", gain: 1 }),
    dcbn: Object.freeze({ track: "amb028", gain: 1 }),
    dcha: Object.freeze({ track: "amb032", gain: 1 }),
    dslt: Object.freeze({ track: "amb042", gain: 1 }),
    djaz: Object.freeze({ track: "amb043", gain: 1 }),
    dbhb: Object.freeze({ track: "amb043", gain: 1 }),
    dhqb: Object.freeze({ track: "amb043", gain: 1 }),
    mfsy: Object.freeze({ track: "amb013", gain: 1 }),
    ma00: Object.freeze({ track: "amb013", gain: 1 }),
    ma00race: Object.freeze({ track: "amb013", gain: 1 }),
    mksg: Object.freeze({ track: "amb015", gain: 1 }),
  }),
});

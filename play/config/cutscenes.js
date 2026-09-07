function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const CUTSCENE_DEFINITIONS = [
  {
    "id": "S1-HOUO-01",
    "label": "Phoenix Mirror — Ryo and Fuku-san",
    "worldId": "exterior",
    "packageId": "houo",
    "program": {
      "programId": "preview-s1-houo-01",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    },
    "areaLabel": "Hazuki Grounds",
    "description": "Ryo and Fuku-san examine the Phoenix Mirror."
  },
  {
    "id": "S1-TOKI-01",
    "label": "Chinese Letter — Xia Xiu Yu",
    "worldId": "drsa",
    "packageId": "toki",
    "program": {
      "programId": "preview-s1-toki-01",
      "entryFunction": "$activity-preview",
      "area": "TOKI",
      "worldId": "drsa"
    },
    "areaLabel": "Russiya China Shop",
    "description": "Ryo asks Xia Xiu Yu to read the Chinese letter found at the Hazuki residence."
  },
  {
    "id": "S1-OP02-00",
    "label": "Opening Vision — Shenhua and the Hawk",
    "worldId": "op02",
    "packageId": "op02-opening",
    "program": {
      "programId": "preview-s1-op02-00",
      "entryFunction": "$activity-sequence",
      "area": "OP02",
      "worldId": "op02"
    },
    "areaLabel": "Guilin Mountains",
    "description": "Shenhua stands on a mountain cliff as a hawk circles above her.",
    "lightingPresetIndex": 1,
    "depthHaze": {
      "startDistance": 5,
      "endDistance": 800,
      "foregroundEndDistance": 90,
      "foregroundOpacity": 0.4,
      "maximumOpacity": 0.85,
      "color": [0.62, 0.36, 0.22]
    },
    "completion": {
      "notice": "Opening vision complete."
    }
  },
  {
    "id": "S1-000",
    "label": "Introduction — Iwao's Murder",
    "worldId": "op00",
    "packageId": "op00-opening",
    "program": {
      "programId": "preview-s1-000",
      "entryFunction": "$activity-sequence",
      "area": "OP00",
      "worldId": "op00"
    },
    "areaLabel": "Hazuki Residence",
    "description": "Ryo returns home and confronts Lan Di during the attack on the Hazuki family dojo.",
    "completion": {
      "notice": "Introduction complete.",
      "worldId": "interior"
    }
  },
  {
    "id": "S1-DRAUTH-01",
    "label": "DRAUTH — Sequence 1",
    "worldId": "dobuita",
    "packageId": "drauth",
    "program": {
      "programId": "preview-s1-drauth-01",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    },
    "areaLabel": "Dobuita",
    "description": "The first production-packaged DRAUTH native AUTH sequence."
  },
  {
    "id": "S1-DRAUTH-02",
    "label": "DRAUTH — Sequence 2",
    "worldId": "dobuita",
    "packageId": "drauth",
    "areaLabel": "Dobuita",
    "description": "The second production-packaged DRAUTH native AUTH sequence.",
    "program": {
      "programId": "preview-s1-drauth-02",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-YQ14-01",
    "label": "Heartbeats Alley — Confrontation",
    "worldId": "yq14",
    "packageId": "yq14",
    "areaLabel": "Heartbeats Bar Exterior Alley",
    "description": "Ryo confronts Smith and Tony outside Heartbeats.",
    "program": {
      "programId": "preview-s1-yq14-01",
      "entryFunction": "$activity-preview",
      "area": "YQ14",
      "worldId": "yq14"
    }
  },
  {
    "id": "S1-YQ14-02",
    "label": "Heartbeats Alley — Beer QTE",
    "worldId": "yq14",
    "packageId": "yq14",
    "areaLabel": "Heartbeats Bar Exterior Alley",
    "description": "The follow-up alley sequence with the native beer prop, dialogue, and QTE staging.",
    "program": {
      "programId": "preview-s1-yq14-02",
      "entryFunction": "$activity-preview",
      "area": "YQ14",
      "worldId": "yq14"
    }
  },
  {
    "id": "S1-YBHN-01",
    "label": "Nozomi Waits for Ryo",
    "worldId": "dobuita",
    "packageId": "ybhn",
    "areaLabel": "Dobuita",
    "description": "Nozomi waits for Ryo after class and asks about his future.",
    "program": {
      "programId": "preview-s1-ybhn-01",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-DJHN-01",
    "label": "Vending Machine — Sequence 1",
    "worldId": "dobuita",
    "packageId": "djhn",
    "areaLabel": "Dobuita",
    "description": "A native vending-machine encounter with Wang Guang Ji.",
    "program": {
      "programId": "preview-s1-djhn-01",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-DJHN-02",
    "label": "Vending Machine — Sequence 2",
    "worldId": "dobuita",
    "packageId": "djhn",
    "areaLabel": "Dobuita",
    "description": "A native vending-machine encounter with Wang Guang Ji.",
    "program": {
      "programId": "preview-s1-djhn-02",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-DJHN-03",
    "label": "Vending Machine — Sequence 3",
    "worldId": "dobuita",
    "packageId": "djhn",
    "areaLabel": "Dobuita",
    "description": "A native vending-machine encounter with Wang Guang Ji.",
    "program": {
      "programId": "preview-s1-djhn-03",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-DJHN-04",
    "label": "Vending Machine — Sequence 4",
    "worldId": "dobuita",
    "packageId": "djhn",
    "areaLabel": "Dobuita",
    "description": "A native vending-machine encounter with Wang Guang Ji.",
    "program": {
      "programId": "preview-s1-djhn-04",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-DJHN-05",
    "label": "Vending Machine — Sequence 5",
    "worldId": "dobuita",
    "packageId": "djhn",
    "areaLabel": "Dobuita",
    "description": "A native vending-machine encounter with Wang Guang Ji.",
    "program": {
      "programId": "preview-s1-djhn-05",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-DJHN-06",
    "label": "Vending Machine — Sequence 6",
    "worldId": "dobuita",
    "packageId": "djhn",
    "areaLabel": "Dobuita",
    "description": "A native vending-machine encounter with Wang Guang Ji.",
    "program": {
      "programId": "preview-s1-djhn-06",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-DJHN-07",
    "label": "Vending Machine — Sequence 7",
    "worldId": "dobuita",
    "packageId": "djhn",
    "areaLabel": "Dobuita",
    "description": "A native vending-machine encounter with Wang Guang Ji.",
    "program": {
      "programId": "preview-s1-djhn-07",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-01",
    "label": "Yamagishi's Advice — Sequence 1",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-01",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-02",
    "label": "Yamagishi's Advice — Sequence 2",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-02",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-03",
    "label": "Yamagishi's Advice — Sequence 3",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-03",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-04",
    "label": "Yamagishi's Advice — Sequence 4",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-04",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-05",
    "label": "Yamagishi's Advice — Sequence 5",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-05",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-06",
    "label": "Yamagishi's Advice — Sequence 6",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-06",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-07",
    "label": "Yamagishi's Advice — Sequence 7",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-07",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-08",
    "label": "Yamagishi's Advice — Sequence 8",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-08",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-09",
    "label": "Yamagishi's Advice — Sequence 9",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-09",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-10",
    "label": "Yamagishi's Advice — Sequence 10",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-10",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-11",
    "label": "Yamagishi's Advice — Sequence 11",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-11",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-D0W0-12",
    "label": "Yamagishi's Advice — Sequence 12",
    "worldId": "dobuita",
    "packageId": "d0w0",
    "areaLabel": "Dobuita",
    "description": "A native conversation with Shigeo Yamagishi about martial arts and the Hazuki family.",
    "program": {
      "programId": "preview-s1-d0w0-12",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-DNOZ-01",
    "label": "Nozomi's Confession",
    "worldId": "dnoz",
    "packageId": "dnoz-ski",
    "areaLabel": "Sakuragaoka",
    "description": "Nozomi confesses her feelings to Ryo in Sakuragaoka.",
    "program": {
      "programId": "preview-s1-dnoz-01",
      "entryFunction": "$activity-sequence",
      "area": "DNOZ",
      "worldId": "dnoz"
    }
  },
  {
    "id": "S1-DNOZ-02",
    "label": "Nozomi's Tears",
    "worldId": "dnoz",
    "packageId": "dnoz",
    "areaLabel": "Sakuragaoka",
    "description": "Ryo finds Nozomi upset and comforts her in Sakuragaoka.",
    "program": {
      "programId": "preview-s1-dnoz-02",
      "entryFunction": "$activity-sequence",
      "area": "DNOZ",
      "worldId": "dnoz"
    }
  },
  {
    "id": "S1-TGMA-01",
    "label": "Fuku-san's Letter",
    "worldId": "exterior",
    "packageId": "tgma",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Fuku-san speaks with Ryo and gives him a letter from Ine-san.",
    "program": {
      "programId": "preview-s1-tgma-01",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-JHW0-01",
    "label": "Fuku-san's Move Training — Sequence 1",
    "worldId": "exterior",
    "packageId": "jhw0",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo practices martial arts with Fuku-san in the Hazuki grounds.",
    "program": {
      "programId": "preview-s1-jhw0-01",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-JHW0-02",
    "label": "Fuku-san's Move Training — Sequence 2",
    "worldId": "exterior",
    "packageId": "jhw0",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo practices martial arts with Fuku-san in the Hazuki grounds.",
    "program": {
      "programId": "preview-s1-jhw0-02",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-JHW0-03",
    "label": "Fuku-san's Move Training — Sequence 3",
    "worldId": "exterior",
    "packageId": "jhw0",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo practices martial arts with Fuku-san in the Hazuki grounds.",
    "program": {
      "programId": "preview-s1-jhw0-03",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-JHW0-04",
    "label": "Fuku-san's Move Training — Sequence 4",
    "worldId": "exterior",
    "packageId": "jhw0",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo practices martial arts with Fuku-san in the Hazuki grounds.",
    "program": {
      "programId": "preview-s1-jhw0-04",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-JHW0-05",
    "label": "Fuku-san's Move Training — Sequence 5",
    "worldId": "exterior",
    "packageId": "jhw0",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo practices martial arts with Fuku-san in the Hazuki grounds.",
    "program": {
      "programId": "preview-s1-jhw0-05",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-JHW0-06",
    "label": "Fuku-san's Move Training — Sequence 6",
    "worldId": "exterior",
    "packageId": "jhw0",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo practices martial arts with Fuku-san in the Hazuki grounds.",
    "program": {
      "programId": "preview-s1-jhw0-06",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-JHW0-07",
    "label": "Fuku-san's Move Training — Sequence 7",
    "worldId": "exterior",
    "packageId": "jhw0",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo practices martial arts with Fuku-san in the Hazuki grounds.",
    "program": {
      "programId": "preview-s1-jhw0-07",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-JHW0-08",
    "label": "Fuku-san's Move Training — Sequence 8",
    "worldId": "exterior",
    "packageId": "jhw0",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo practices martial arts with Fuku-san in the Hazuki grounds.",
    "program": {
      "programId": "preview-s1-jhw0-08",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-MSKA-01",
    "label": "Fuku-san — Iwao's Death",
    "worldId": "exterior",
    "packageId": "mska",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo and Fuku-san discuss Iwao's death and the path Ryo has chosen.",
    "program": {
      "programId": "preview-s1-mska-01",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-KAKG-01",
    "label": "Fuku-san — Ryo's Resolve",
    "worldId": "exterior",
    "packageId": "kakg",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo speaks with Fuku-san about whether he is prepared for what lies ahead.",
    "program": {
      "programId": "preview-s1-kakg-01",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-KAKG-02",
    "label": "Ine-san — Promise to Iwao",
    "worldId": "exterior",
    "packageId": "kakg",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo and Ine-san speak about his promise to Iwao.",
    "program": {
      "programId": "preview-s1-kakg-02",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-BUSS-01",
    "label": "Bus to New Yokosuka Harbor — Boarding A",
    "worldId": "dobuita",
    "packageId": "buss",
    "areaLabel": "Dobuita Bus Stop",
    "description": "The first native random variant of Ryo boarding the harbor bus.",
    "program": {
      "programId": "preview-s1-buss-01",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-BUSS-02",
    "label": "Bus to New Yokosuka Harbor — Boarding B",
    "worldId": "dobuita",
    "packageId": "buss",
    "areaLabel": "Dobuita Bus Stop",
    "description": "The second native random variant of Ryo boarding the harbor bus.",
    "program": {
      "programId": "preview-s1-buss-02",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-BUSS-03",
    "label": "Bus to New Yokosuka Harbor — Arrival A",
    "worldId": "dobuita",
    "packageId": "buss",
    "areaLabel": "Dobuita Bus Stop",
    "description": "The first native random variant of Ryo leaving the harbor bus.",
    "program": {
      "programId": "preview-s1-buss-03",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-BUSS-04",
    "label": "Bus to New Yokosuka Harbor — Arrival B",
    "worldId": "dobuita",
    "packageId": "buss",
    "areaLabel": "Dobuita Bus Stop",
    "description": "The second native random variant of Ryo leaving the harbor bus.",
    "program": {
      "programId": "preview-s1-buss-04",
      "entryFunction": "$activity-preview",
      "area": "D000",
      "worldId": "dobuita"
    }
  },
  {
    "id": "S1-HIHY-01",
    "label": "Iwao and Young Ryo — The Path",
    "worldId": "exterior",
    "packageId": "hihy",
    "areaLabel": "Hazuki Residence Grounds",
    "description": "Ryo remembers a childhood lesson from his father beneath the moon.",
    "program": {
      "programId": "preview-s1-hihy-01",
      "entryFunction": "$activity-preview",
      "area": "JHD0",
      "worldId": "exterior"
    }
  },
  {
    "id": "S1-CATA1-01",
    "label": "Megumi and the Kitten",
    "worldId": "yamanose",
    "packageId": "cata1",
    "areaLabel": "Yamanose Shrine",
    "description": "Ryo and Megumi care for the injured kitten at the Yamanose shrine.",
    "program": {
      "programId": "preview-s1-cata1-01",
      "entryFunction": "$activity-sequence",
      "area": "JU00",
      "worldId": "yamanose"
    }
  },
  {
    "id": "S1-EVSN-01",
    "label": "Nozomi Rescue — Main Route",
    "worldId": "sakuragaoka",
    "packageId": "evsn",
    "areaLabel": "Sakuragaoka",
    "description": "Ryo confronts Nozomi's kidnappers and rescues her in Sakuragaoka.",
    "program": {
      "programId": "preview-s1-evsn-01",
      "entryFunction": "$activity-sequence",
      "area": "JD00",
      "worldId": "sakuragaoka"
    }
  },
  {
    "id": "S1-EVSN-02",
    "label": "Nozomi Rescue — Alternate Lead-in",
    "worldId": "sakuragaoka",
    "packageId": "evsn",
    "areaLabel": "Sakuragaoka",
    "description": "The native alternate opening branch of Ryo's rescue of Nozomi.",
    "program": {
      "programId": "preview-s1-evsn-02",
      "entryFunction": "$activity-sequence",
      "area": "JD00",
      "worldId": "sakuragaoka"
    }
  },
  {
    "id": "S1-BEBF-01",
    "label": "Ryo's Nightmare — Shenhua's Warning",
    "worldId": "interior",
    "packageId": "bebf",
    "program": {
      "programId": "preview-s1-bebf-01",
      "entryFunction": "$activity-sequence",
      "area": "JOMO",
      "worldId": "interior"
    },
    "areaLabel": "Hazuki Residence",
    "description": "Ryo dreams of Shenhua beneath the cherry blossoms and awakens in the Hazuki residence."
  },
  {
    "id": "S1-KKYA-01",
    "label": "Dream Vision — Phoenix Mirror",
    "worldId": "interior",
    "packageId": "kkya",
    "areaLabel": "Hazuki Residence",
    "description": "The first silent vision selected by the Hazuki bedroom dream owner.",
    "program": {
      "programId": "preview-s1-kkya-01",
      "entryFunction": "$activity-preview",
      "area": "JOMO",
      "worldId": "interior"
    }
  },
  {
    "id": "S1-KKYB-01",
    "label": "Dream Vision — The Two Mirrors",
    "worldId": "interior",
    "packageId": "kkyb",
    "areaLabel": "Hazuki Residence",
    "description": "Ryo's dream joins the dragon and phoenix mirrors beneath the circling hawk.",
    "program": {
      "programId": "preview-s1-kkyb-01",
      "entryFunction": "$activity-preview",
      "area": "JOMO",
      "worldId": "interior"
    }
  },
  {
    "id": "S1-KKYC-01",
    "label": "Dream Vision — Shenhua",
    "worldId": "interior",
    "packageId": "kkyc",
    "areaLabel": "Hazuki Residence",
    "description": "A silent vision of Shenhua selected by the Hazuki bedroom dream owner.",
    "program": {
      "programId": "preview-s1-kkyc-01",
      "entryFunction": "$activity-preview",
      "area": "JOMO",
      "worldId": "interior"
    }
  },
  {
    "id": "S1-KKYD-01",
    "label": "Dream Vision — Shenhua and the Stone",
    "worldId": "interior",
    "packageId": "kkyd",
    "areaLabel": "Hazuki Residence",
    "description": "Shenhua appears beside the mysterious stone in Ryo's dream.",
    "program": {
      "programId": "preview-s1-kkyd-01",
      "entryFunction": "$activity-preview",
      "area": "JOMO",
      "worldId": "interior"
    }
  },
  {
    "id": "S1-KKYE-01",
    "label": "Dream Vision — Shenhua and the Hawk",
    "worldId": "interior",
    "packageId": "kkye",
    "areaLabel": "Hazuki Residence",
    "description": "Shenhua and the hawk pass beneath the moon in Ryo's dream.",
    "program": {
      "programId": "preview-s1-kkye-01",
      "entryFunction": "$activity-preview",
      "area": "JOMO",
      "worldId": "interior"
    }
  },
  {
    "id": "S1-KKYF-01",
    "label": "Dream Vision — Lan Di",
    "worldId": "interior",
    "packageId": "kkyf",
    "areaLabel": "Hazuki Residence",
    "description": "A brief vision of Lan Di and the dragon mirror closes the dream family.",
    "program": {
      "programId": "preview-s1-kkyf-01",
      "entryFunction": "$activity-preview",
      "area": "JOMO",
      "worldId": "interior"
    }
  },
  {
    "id": "S1-SAKR-01",
    "label": "Iwao and Young Ryo — Training Memory",
    "worldId": "yd01",
    "packageId": "sakr",
    "areaLabel": "Hazuki Dojo Training Grounds",
    "description": "Iwao teaches a young Ryo during a memory of their training beneath the cherry blossoms.",
    "program": {
      "programId": "preview-s1-sakr-01",
      "entryFunction": "$activity-preview",
      "area": "YD01",
      "worldId": "yd01"
    }
  }
];

export const CUTSCENES = deepFreeze(CUTSCENE_DEFINITIONS);

export const CUTSCENE_SELECTIONS = Object.freeze(
  CUTSCENES.map(({ id, label }) => Object.freeze([id, label])),
);

export function availableCutscene(cutsceneId) {
  return CUTSCENES.find(({ id }) => id === cutsceneId) || null;
}

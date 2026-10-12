// Ring order. Art is dealt straight down this list, so entry n sits one slot
// along from n-1 and the column can count 01..18 as the carousel turns.
// Reordering these rows moves the ring, the column and the numbering together;
// nothing else needs touching.
//
// `file` is the card on the ring and the frame it opens into. `media` is what
// follows it down the project page — as many pictures and clips as the set
// has, up to six — each with the shape of its box (land 3:2, port 4:5, wide
// 16:9), which sets the page's rhythm, and a caption (the picture's
// accessible label; it is not printed). An entry with `video`
// plays that clip in its box once it is mostly in view. `video` on the
// project itself is the card's own footage, a seamless loop that plays on
// the front card once the ring has settled and carries on into the hero;
// its first frame is `file`, cut from the same clip at the same moment and
// graded alike, so the two crossfade without a shift. `insights` are three
// short notes, set as a numbered row between the opening pictures and the
// rest.
//
// All placeholder. The photographs are Unsplash stock (Unsplash License)
// and the clips Mixkit stock (Mixkit Stock Video Free License), credited per
// image in the README; every name, discipline, year and sentence here is
// invented so the page has something to set. Replace the lot with your own.
//
// Chosen as sets, one shoot or one place per project: classic machines,
// architecture, gardens and ruins in warm southern light, under one shared
// grade so the ring reads as one body of work. Neighbours melt into each
// other, so the rows run dark / light / mid, and the order walks a colour
// wheel — reds, rose stone, gold, greens, desert, pool blue, silver, gold,
// back to red — so any arc on screen is in one key.
export const PROJECTS = [
  {
    file: "rosso.webp",
    name: "Rosso",
    type: "Photography",
    year: "2026",
    media: [
      {
        src: "rosso-1.webp",
        shape: "land",
        caption: "Testarossa, in the shade",
      },
      {
        src: "rosso-2.webp",
        shape: "land",
        caption: "Twelve cylinders",
      },
      {
        src: "rosso-3.webp",
        shape: "port",
        caption: "A race car's wheel",
      },
      {
        src: "rosso-4.webp",
        shape: "port",
        caption: "F40, from above",
      },
      {
        src: "rosso-5.webp",
        shape: "land",
        caption: "In the garage",
      },
      {
        src: "rosso-6.webp",
        shape: "port",
        caption: "After dark",
      },
    ],
    insights: [
      {
        title: "Light",
        text: "Only what came in through the garage door. No strobes, so the red stays the red the factory painted.",
      },
      {
        title: "Detail",
        text: "Shot as objects first: badges, cam covers, a steering wheel, before any full profile.",
      },
      {
        title: "Restraint",
        text: "Six frames kept from two days. Most of what was shot was too clean to keep.",
      },
    ],
    blurb:
      "Ferraris photographed in the half-dark of private garages, lit by whatever came in through the door. Red as it looks when nobody is trying to sell it.",
  },
  {
    file: "salk.webp",
    name: "Salk",
    type: "Architecture",
    year: "2025",
    media: [
      {
        src: "salk-1.webp",
        shape: "land",
        caption: "The grove",
      },
      {
        src: "salk-2.webp",
        shape: "port",
        caption: "Concrete, end to end",
      },
      {
        src: "salk-3.webp",
        shape: "port",
        caption: "Looking up",
      },
      {
        src: "salk-4.webp",
        shape: "port",
        caption: "The studies",
      },
    ],
    insights: [
      {
        title: "Axis",
        text: "Everything turns on the channel of water that runs the length of the courtyard toward the ocean.",
      },
      {
        title: "Material",
        text: "Travertine underfoot, board-marked concrete above, teak in between. Three materials, nothing else.",
      },
      {
        title: "Weather",
        text: "Shot under flat cloud, so the concrete reads as colour rather than as shadow.",
      },
    ],
    blurb:
      "Louis Kahn's courtyard above the Pacific: travertine, concrete and teak arranged around one line of water that runs out to the horizon.",
  },
  {
    file: "muralla.webp",
    name: "Muralla",
    type: "Campaign",
    year: "2024",
    media: [
      {
        src: "muralla-1.webp",
        shape: "port",
        caption: "The blue stair",
      },
      {
        src: "muralla-2.webp",
        shape: "port",
        caption: "A courtyard from above",
      },
      {
        src: "muralla-3.webp",
        shape: "port",
        caption: "A tree's shadow",
      },
      {
        src: "muralla-4.webp",
        shape: "port",
        caption: "Pink against blue",
      },
      {
        src: "muralla-5.webp",
        shape: "port",
        caption: "Two chairs and the sea",
      },
    ],
    insights: [
      {
        title: "Colour",
        text: "Pinks and reds outside, blues and violets in the stairwells: the palette changes as you climb.",
      },
      {
        title: "Geometry",
        text: "Stairs, bridges and courtyards lock together like a puzzle. Every frame is a crop of it.",
      },
      {
        title: "Sea",
        text: "The terraces face the Mediterranean, so the horizon becomes part of the wall.",
      },
    ],
    blurb:
      "Ricardo Bofill's red wall on the coast at Calpe, walked end to end in an afternoon. Stairs turn into sky, and every courtyard opens onto the sea.",
  },
  {
    file: "petra.webp",
    name: "Petra",
    type: "Editorial",
    year: "2026",
    media: [
      {
        src: "petra-1.webp",
        shape: "land",
        caption: "The Treasury",
      },
      {
        src: "petra-2.webp",
        shape: "land",
        caption: "The Monastery, midday",
      },
      {
        src: "petra-3.webp",
        shape: "port",
        caption: "The Monastery from a cave",
      },
      {
        src: "petra-4.webp",
        shape: "port",
        caption: "Where the Siq opens",
      },
      {
        src: "petra-5.webp",
        shape: "port",
        caption: "Petra by night",
      },
    ],
    insights: [
      {
        title: "Carved",
        text: "The façades are carved, not built: cut into the cliff from the top down.",
      },
      {
        title: "Approach",
        text: "The Treasury is reached through the Siq, a narrow canyon that opens all at once.",
      },
      {
        title: "Hour",
        text: "Late sun turns the sandstone from rose to burnt orange in a matter of minutes.",
      },
    ],
    blurb:
      "The rose city, reached on foot through the Siq and photographed in the hour when the sandstone burns and the last visitors have gone.",
  },
  {
    file: "concordia.webp",
    name: "Concordia",
    type: "Photography",
    year: "2023",
    media: [
      {
        src: "concordia-1.webp",
        shape: "land",
        caption: "Temple and olive",
      },
      {
        src: "concordia-2.webp",
        shape: "land",
        caption: "The Temple of Concord",
      },
      {
        src: "concordia-3.webp",
        shape: "land",
        caption: "The road, in blossom",
      },
      {
        src: "concordia-4.webp",
        shape: "land",
        caption: "Afternoon",
      },
      {
        src: "concordia-5.webp",
        shape: "land",
        caption: "A ruined colonnade",
      },
    ],
    insights: [
      {
        title: "Survival",
        text: "The Temple of Concord is one of the best-preserved Doric temples anywhere.",
      },
      {
        title: "Setting",
        text: "Almond and olive trees grow right up to the stones, so the ruins read as landscape.",
      },
      {
        title: "Light",
        text: "From late morning on, the limestone goes gold against a hard blue sky.",
      },
    ],
    blurb:
      "The Valley of the Temples at Agrigento, worked through from the almond trees to the Temple of Concord, which has stood nearly whole for twenty-four centuries.",
  },
  {
    file: "alhambra.webp",
    name: "Alhambra",
    type: "Film",
    year: "2025",
    media: [
      {
        src: "alhambra-1.webp",
        shape: "land",
        caption: "Court of the Myrtles",
      },
      {
        src: "alhambra-2.webp",
        shape: "land",
        caption: "A window onto the city",
      },
      {
        src: "alhambra-3.webp",
        shape: "wide",
        caption: "The hill, from dusk to dark",
        video: "alhambra-3.mp4",
      },
      {
        src: "alhambra-4.webp",
        shape: "port",
        caption: "Carved arches",
      },
      {
        src: "alhambra-5.webp",
        shape: "port",
        caption: "A forest of columns",
      },
      {
        src: "alhambra-6.webp",
        shape: "land",
        caption: "A garden through a window",
      },
    ],
    insights: [
      {
        title: "Water",
        text: "The courts are built around still water. The long pool in the Court of the Myrtles doubles every arch.",
      },
      {
        title: "Surface",
        text: "Every wall is worked: carved plaster, tile and calligraphy laid over plain brick.",
      },
      {
        title: "Dusk",
        text: "The film follows the hill from daylight to floodlight, as the palace turns from ochre to gold.",
      },
    ],
    blurb:
      "The Nasrid palaces from first light to floodlight: arches carved like lace, water held still in the courts, and the whole hill turning gold at dusk.",
  },
  {
    file: "majorelle.webp",
    name: "Majorelle",
    type: "Art Direction",
    year: "2024",
    media: [
      {
        src: "majorelle-1.webp",
        shape: "land",
        caption: "Cobalt and cactus",
      },
      {
        src: "majorelle-2.webp",
        shape: "port",
        caption: "The courtyard",
      },
      {
        src: "majorelle-3.webp",
        shape: "port",
        caption: "A blue fountain",
      },
    ],
    insights: [
      {
        title: "Colour",
        text: "Against the cobalt walls, every cactus reads as a sculpture.",
      },
      {
        title: "Shade",
        text: "Palms and bamboo break up the Marrakech sun, so the light falls in pieces.",
      },
      {
        title: "Collection",
        text: "Plants from five continents, arranged more like a collection than a garden.",
      },
    ],
    blurb:
      "The Marrakech garden that made a colour famous: cobalt walls, cactus sculpted by the sun, and shade deep enough to swim in.",
  },
  {
    file: "olive.webp",
    name: "Olive",
    type: "Editorial",
    year: "2025",
    media: [
      {
        src: "olive-1.webp",
        shape: "land",
        caption: "A single tree",
      },
      {
        src: "olive-2.webp",
        shape: "land",
        caption: "A grove on the hill",
      },
      {
        src: "olive-3.webp",
        shape: "port",
        caption: "Arcade and olive",
      },
      {
        src: "olive-4.webp",
        shape: "port",
        caption: "Old wood",
      },
    ],
    insights: [
      {
        title: "Age",
        text: "Olive trees can live for centuries. The oldest are hollow and still bear fruit.",
      },
      {
        title: "Silver",
        text: "The underside of the leaf is silver, so a grove changes colour with the wind.",
      },
      {
        title: "Ruins",
        text: "In the south the trees grow among old walls and terraces, as if the ruins had been planted.",
      },
    ],
    blurb:
      "A study of the olive tree around the Mediterranean: alone on a hill, in groves, among ruins. Silver leaves, old wood and a great deal of patience.",
  },
  {
    file: "mesa.webp",
    name: "Mesa",
    type: "Architecture",
    year: "2023",
    media: [
      {
        src: "mesa-1.webp",
        shape: "land",
        caption: "Butterfly roofs",
      },
      {
        src: "mesa-2.webp",
        shape: "land",
        caption: "A pink door",
      },
      {
        src: "mesa-3.webp",
        shape: "port",
        caption: "An orange door",
      },
      {
        src: "mesa-4.webp",
        shape: "port",
        caption: "A coupé in the drive",
      },
      {
        src: "mesa-5.webp",
        shape: "land",
        caption: "Palms and mountains",
      },
    ],
    insights: [
      {
        title: "Roofline",
        text: "Butterfly and folded roofs cast shade and frame the mountains in the same gesture.",
      },
      {
        title: "Colour",
        text: "The front door is the one loud thing: pink or orange against white block.",
      },
      {
        title: "Garden",
        text: "Gravel, agave and palms instead of lawn. The garden is as designed as the house.",
      },
    ],
    blurb:
      "Mid-century houses under the desert mountains: butterfly roofs, breeze block, a pink front door and a pool that has never seen a cloud.",
  },
  {
    file: "havana.webp",
    name: "Havana",
    type: "Film",
    year: "2024",
    video: "havana.mp4",
    media: [
      {
        src: "havana-1.webp",
        shape: "wide",
        caption: "Top down",
        video: "havana-1.mp4",
      },
      {
        src: "havana-2.webp",
        shape: "land",
        caption: "In the shade",
        video: "havana-2.mp4",
      },
    ],
    insights: [
      {
        title: "Survival",
        text: "Most of the cars predate 1960 and are kept running with whatever parts can be found.",
      },
      {
        title: "Movement",
        text: "Filmed from the back seat of a moving convertible, at the car's own pace.",
      },
      {
        title: "Colour",
        text: "Faded paint and patched chrome against peeling colonial walls.",
      },
    ],
    blurb:
      "A short film made with the classic cars of Havana, which never stopped running: one convertible with the top down, another parked in the shade.",
  },
  {
    file: "piscina.webp",
    name: "Piscina",
    type: "Motion",
    year: "2026",
    video: "piscina.mp4",
    media: [
      {
        src: "piscina-1.webp",
        shape: "port",
        caption: "Light on the tiles",
        video: "piscina-1.mp4",
      },
      {
        src: "piscina-2.webp",
        shape: "port",
        caption: "Palms over the pool",
      },
      {
        src: "piscina-3.webp",
        shape: "wide",
        caption: "Noon",
        video: "piscina-3.mp4",
      },
    ],
    insights: [
      {
        title: "Surface",
        text: "Three takes on one subject: the water's surface, its reflection and the light beneath it.",
      },
      {
        title: "Loop",
        text: "Each clip is cut to loop without a visible join, so the water never stops.",
      },
      {
        title: "Calm",
        text: "No one in frame. Just architecture, water and noon.",
      },
    ],
    blurb:
      "Water in three takes: a white pool with its cabanas mirrored, palms at noon, and the light that moves across the tiles below.",
  },
  {
    file: "riva.webp",
    name: "Riva",
    type: "Photography",
    year: "2025",
    media: [
      {
        src: "riva-1.webp",
        shape: "land",
        caption: "Dawn, from the bow",
      },
      {
        src: "riva-2.webp",
        shape: "land",
        caption: "The dashboard",
      },
      {
        src: "riva-3.webp",
        shape: "wide",
        caption: "Crossing the bay",
        video: "riva-3.mp4",
      },
      {
        src: "riva-4.webp",
        shape: "land",
        caption: "Mahogany and chrome",
      },
      {
        src: "riva-5.webp",
        shape: "land",
        caption: "A lake village",
      },
      {
        src: "riva-6.webp",
        shape: "port",
        caption: "Moored",
      },
    ],
    insights: [
      {
        title: "Craft",
        text: "Many coats of varnish, sanded between each, give the mahogany its depth.",
      },
      {
        title: "Lakes",
        text: "Classic runabouts still go out every summer on the Italian lakes, where Riva has built them for generations.",
      },
      {
        title: "Detail",
        text: "Dashboards, deck fittings and a name painted on the transom: the boats are read in close-up.",
      },
    ],
    blurb:
      "Varnished mahogany on still water: classic runabouts photographed on the lakes and harbours where they still go out every summer.",
  },
  {
    file: "forum.webp",
    name: "Forum",
    type: "Documentary",
    year: "2024",
    media: [
      {
        src: "forum-1.webp",
        shape: "land",
        caption: "The Temple of Saturn",
      },
      {
        src: "forum-2.webp",
        shape: "land",
        caption: "Morning",
      },
      {
        src: "forum-3.webp",
        shape: "port",
        caption: "The Arch of Titus",
      },
      {
        src: "forum-4.webp",
        shape: "port",
        caption: "Three columns",
      },
      {
        src: "forum-5.webp",
        shape: "land",
        caption: "The Colosseum, last light",
      },
    ],
    insights: [
      {
        title: "Layers",
        text: "Temples, arches and churches from a thousand years share one valley.",
      },
      {
        title: "Hours",
        text: "Blue hour for the lit columns, early morning for everything else.",
      },
      {
        title: "Scale",
        text: "Wide views from above first, then the Arch of Titus and single columns up close.",
      },
    ],
    blurb:
      "Rome's oldest square at the two hours that suit it best: the blue hour, when the columns are lit, and early morning, before anyone else arrives.",
  },
  {
    file: "positano.webp",
    name: "Positano",
    type: "Editorial",
    year: "2023",
    media: [
      {
        src: "positano-1.webp",
        shape: "land",
        caption: "Bougainvillea",
      },
      {
        src: "positano-2.webp",
        shape: "land",
        caption: "From the road",
      },
      {
        src: "positano-3.webp",
        shape: "wide",
        caption: "The coast from the air",
        video: "positano-3.mp4",
      },
      {
        src: "positano-4.webp",
        shape: "port",
        caption: "Stacked",
      },
      {
        src: "positano-5.webp",
        shape: "port",
        caption: "Down to the water",
      },
      {
        src: "positano-6.webp",
        shape: "land",
        caption: "Blue hour",
      },
    ],
    insights: [
      {
        title: "Vertical",
        text: "The village climbs straight up from the beach, so every frame is stacked.",
      },
      {
        title: "Colour",
        text: "Pastel walls, bougainvillea and the sea set the palette. Nothing was added.",
      },
      {
        title: "Hour",
        text: "From the water at midday to the terraces at blue hour, when the lights come on.",
      },
    ],
    blurb:
      "A vertical village on the Amalfi coast, photographed from the water, from the stairs and from the terraces, with bougainvillea for punctuation.",
  },
  {
    file: "hothouse.webp",
    name: "Hothouse",
    type: "Photography",
    year: "2026",
    media: [
      {
        src: "hothouse-1.webp",
        shape: "land",
        caption: "Reflected",
      },
      {
        src: "hothouse-2.webp",
        shape: "port",
        caption: "Inside the glass",
      },
      {
        src: "hothouse-3.webp",
        shape: "port",
        caption: "Spring, outside",
      },
      {
        src: "hothouse-4.webp",
        shape: "land",
        caption: "Another house of palms",
      },
      {
        src: "hothouse-5.webp",
        shape: "port",
        caption: "Frost, early",
      },
    ],
    insights: [
      {
        title: "Iron",
        text: "Cast iron and glass: the Victorian way to keep a tropical climate through a northern winter.",
      },
      {
        title: "Frost",
        text: "On frozen mornings the frames go white outside while the palms stay green within.",
      },
      {
        title: "Inside",
        text: "Under the glass the light is soft and even. The whole roof acts as one diffuser.",
      },
    ],
    blurb:
      "Victorian glasshouses on frozen mornings, when the iron frames go white with frost and the palms inside keep a climate of their own.",
  },
  {
    file: "carrera.webp",
    name: "Carrera",
    type: "Campaign",
    year: "2025",
    media: [
      {
        src: "carrera-1.webp",
        shape: "land",
        caption: "Navy, at rest",
      },
      {
        src: "carrera-2.webp",
        shape: "land",
        caption: "Martini",
      },
      {
        src: "carrera-3.webp",
        shape: "port",
        caption: "A Porsche on the cobbles",
      },
      {
        src: "carrera-4.webp",
        shape: "port",
        caption: "Under the palms",
      },
      {
        src: "carrera-5.webp",
        shape: "land",
        caption: "On the street",
      },
      {
        src: "carrera-6.webp",
        shape: "port",
        caption: "Light and shade",
      },
    ],
    insights: [
      {
        title: "Owners",
        text: "Photographed where their owners keep them: on cobbles, under palms, in open garages.",
      },
      {
        title: "Silhouette",
        text: "Half a century of the same silhouette, which is why one profile is enough.",
      },
      {
        title: "Colour",
        text: "Navy, Martini stripes, a red on the cobbles. The colours were chosen by owners, not stylists.",
      },
    ],
    blurb:
      "Air-cooled Porsches photographed where their owners keep them: on cobbles, under palms, in garages left open to the light.",
  },
  {
    file: "gullwing.webp",
    name: "Gullwing",
    type: "Photography",
    year: "2024",
    media: [
      {
        src: "gullwing-1.webp",
        shape: "land",
        caption: "Doors up",
      },
      {
        src: "gullwing-2.webp",
        shape: "land",
        caption: "Profile",
      },
      {
        src: "gullwing-3.webp",
        shape: "land",
        caption: "Red leather",
      },
      {
        src: "gullwing-4.webp",
        shape: "land",
        caption: "A hubcap's reflection",
      },
      {
        src: "gullwing-5.webp",
        shape: "land",
        caption: "An alpine pass",
      },
      {
        src: "gullwing-6.webp",
        shape: "port",
        caption: "300 SL",
      },
    ],
    insights: [
      {
        title: "Doors",
        text: "The gullwing doors follow from the tubular frame, whose high sills ruled out ordinary doors.",
      },
      {
        title: "Studio",
        text: "A black studio and one soft light, so the chrome does the drawing.",
      },
      {
        title: "Sea",
        text: "Then one frame outside, on the rocks by the sea, for the profile against the sky.",
      },
    ],
    blurb:
      "The Mercedes-Benz 300 SL studied in a dark studio and then taken to the sea: doors up, chrome counted, one perfect profile against the sky.",
  },
  {
    file: "spiral.webp",
    name: "Spiral",
    type: "Architecture",
    year: "2026",
    media: [
      {
        src: "spiral-1.webp",
        shape: "land",
        caption: "A double spiral",
      },
      {
        src: "spiral-2.webp",
        shape: "land",
        caption: "Gold, from below",
      },
      {
        src: "spiral-3.webp",
        shape: "land",
        caption: "White, with a garden",
      },
      {
        src: "spiral-4.webp",
        shape: "land",
        caption: "A curve of light",
      },
      {
        src: "spiral-5.webp",
        shape: "port",
        caption: "Plaster",
      },
    ],
    insights: [
      {
        title: "Helix",
        text: "The same idea in stone, iron and plaster: a stair that turns on itself.",
      },
      {
        title: "Viewpoint",
        text: "Every frame looks straight up or straight down, so the stair becomes a pattern.",
      },
      {
        title: "Light",
        text: "Light falls from the top of each well and fades as it winds down.",
      },
    ],
    blurb:
      "Staircases that turn on themselves, photographed from the top and from the bottom: the same idea worked in stone, iron and plaster.",
  },
];

export const IMAGE_FILES = PROJECTS.map((p) => p.file);

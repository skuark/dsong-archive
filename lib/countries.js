// Normalizes metadata.artist_nationality (free text in English and Spanish: "american", "EE.UU.",
// "Spanish", "España"…) to a country. Done at build time; posts.json keeps the original values.
// Codes are ISO 3166-1 numeric, the ids of the map geometries (lib/world-map.js).

// code -> Spanish name (shown on the site; its slug is the URL)
export const COUNTRIES = {
  "032": "Argentina", "036": "Australia", "040": "Austria", "056": "Bélgica", "070": "Bosnia y Herzegovina",
  "076": "Brasil", "104": "Birmania", "124": "Canadá", "132": "Cabo Verde", "152": "Chile",
  "156": "China", "158": "Taiwán", "170": "Colombia", "192": "Cuba", "208": "Dinamarca", "214": "República Dominicana",
  "234": "Islas Feroe", "246": "Finlandia", "250": "Francia", "276": "Alemania", "292": "Gibraltar",
  "300": "Grecia", "352": "Islandia", "356": "India", "360": "Indonesia", "372": "Irlanda", "376": "Israel",
  "380": "Italia", "388": "Jamaica", "392": "Japón", "410": "Corea del Sur", "422": "Líbano",
  "466": "Malí", "484": "México", "504": "Marruecos", "508": "Mozambique", "528": "Países Bajos",
  "554": "Nueva Zelanda", "578": "Noruega", "600": "Paraguay", "616": "Polonia", "620": "Portugal",
  "630": "Puerto Rico", "642": "Rumanía", "643": "Rusia", "686": "Senegal", "710": "Sudáfrica", "724": "España",
  "752": "Suecia", "756": "Suiza", "780": "Trinidad y Tobago", "788": "Túnez", "792": "Turquía", "804": "Ucrania",
  "826": "Reino Unido", "840": "Estados Unidos", "858": "Uruguay",
};

// Lowercased raw value -> code. Regions and compound nationalities go to one country
// (English/Scottish/Northern Irish -> UK, Catalan -> Spain, "Armenian-French" -> France).
const ALIASES = {
  "032": ["argentinian", "argentinean", "argentina"],
  "036": ["australian", "australia"],
  "040": ["austrian", "austria"],
  "056": ["belgian", "bélgica"],
  "076": ["brazilian"],
  "104": ["burmese"],
  "124": ["canadian", "canadá"],
  "132": ["cape verdean"],
  "152": ["chilean"],
  "156": ["china"],
  "170": ["colombia"],
  "192": ["cuban", "cuba"],
  "208": ["danish", "dinamarca"],
  "214": ["república dominicana"],
  "234": ["feroe islands"],
  "246": ["finish"],
  "250": ["french", "francia", "armenian-french"],
  "276": ["german", "alemania"],
  "292": ["gibraltar"],
  "300": ["greek", "grecia"],
  "352": ["icelandic"],
  "360": ["indonesian"],
  "372": ["irish", "irlanda"],
  "376": ["israelite"],
  "380": ["italian", "italia", "italiana"],
  "388": ["jamaican"],
  "392": ["japanese", "japón"],
  "410": ["south korean", "korean"],
  "422": ["lebanese"],
  "466": ["malian"],
  "484": ["mexican", "méxico"],
  "504": ["moroccan"],
  "508": ["mozambican"],
  "528": ["dutch"],
  "554": ["nueva zelanda"],
  "578": ["norwegian"],
  "600": ["paraguayan"],
  "616": ["polish", "poland", "polonia"],
  "620": ["portuguese"],
  "630": ["puerto rican", "puerto rico"],
  "642": ["romanian"],
  "643": ["russian"],
  "710": ["south african"],
  "724": ["spanish", "españa", "española", "catalan", "spanish-french"],
  "752": ["swedish", "suecia"],
  "780": ["trinidad y tobago"],
  "788": ["tunisian"],
  "792": ["turkish", "turquia"],
  "804": ["ucranía"],
  "826": ["british", "brittish", "english", "inglesa", "reino unido", "uk", "the uk", "scottish", "escocia", "northern irish"],
  "840": ["american", "ee.uu.", "eeuu", "usa"],
  "858": ["uruguayan"],
};

// The Spanish names themselves are valid values too (what scripts write from MusicBrainz).
const BY_ALIAS = new Map([
  ...Object.entries(COUNTRIES).map(([code, name]) => [name.toLowerCase(), code]),
  ...Object.entries(ALIASES).flatMap(([code, names]) => names.map((name) => [name, code])),
]);

// Raw value -> { code, name }, or undefined when empty or unknown (validate warns about unknown ones)
export function countryOf(nationality) {
  const code = BY_ALIAS.get(String(nationality ?? "").trim().toLowerCase());
  return code ? { code, name: COUNTRIES[code] } : undefined;
}

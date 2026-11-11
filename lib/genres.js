// Groups metadata.genre (243 free-text values in English and Spanish: "indie pop", "Alternative Rock",
// "bso", "electrónica"…) into broad families for the archive landing (/archive/). The first matching rule wins, so the
// more specific families go first ("indie folk" -> Folk, "alternative metal" -> Metal).
const RULES = [
  ["Bandas sonoras", /\b(bso|ost|soundtrack|musical|opening)\b/],
  ["Metal", /metal|heavy|gotik/],
  ["Hip hop", /hip hop|rap|turntablism/],
  ["Electrónica", /electr|synth|dance|disco|house|techno|trance|dubstep|ambient|chill|downtempo|minimal|chiptune|lo-fi|atmospher|new age|trip hop/],
  ["Flamenco, latina y del mundo", /flamenco|copla|bossa|bolero|tango|fado|cumbia|rumba|ranchera|zamba|samba|salsa|bachata|merengue|latin|reggae|reaggae|ska\b|\bdub\b|rocksteady|afro|klezmer|balkan|sefard|sufi|calipso|caribbean|hawaiian|etnic|ethnic|mundo|pasodoble|carnaval|docta|celtic|zhong guo|trova/],
  ["Jazz, blues y soul", /jazz|blues|soul|r&b|rnb|gospel|funk|swing|scat|crooner|boogie/],
  ["Country", /country|bluegrass|americana|tex-mex/],
  ["Folk y cantautor", /folk|songwriter|cantautor|autor|chanson|protest/],
  ["Indie y alternativo", /indie|alternativ/],
  ["Rock", /rock|punk|grunge|britpop|new wave|garage|psic|psych|dark wave|hardcore/],
  ["Clásica y lírica", /classic|clásica|ópera|lírica|orchestral|cantata|vals|instrumental/],
  ["Pop", /pop|ballad|canción|soft/],
];

// Raw value -> family name, "Otros" when no rule matches, undefined when empty
export function genreFamily(genre) {
  const value = String(genre ?? "").trim().toLowerCase();
  if (!value) return undefined;
  return RULES.find(([, re]) => re.test(value))?.[0] ?? "Otros";
}

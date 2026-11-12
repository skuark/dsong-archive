// "Especiales": posts whose title starts with "Especial" (147). Three shapes, each with its own heading in
// pages/post.njk and a group on /archive/especiales/:
// - album: "Especial Álbum: Grace, de Jeff Buckley", "Especial BSO: Avatar" (the album leads, not a song)
// - festival: "Especial Lagarto Festival 2009: Macaco" (a series: several days in a row, `series` is its
//   name) and other festival posts
// - lista: lists and themes ("Especial One Hit Wonders", "Especial: Concierto de Muse…")

const ALBUM = /^Especial (?:Álbum|Album)\s*[:,]?\s*/i;
const BSO = /^Especial BSO\s*:\s*/i;
const SERIES = /^Especial ((?:Lagarto Festival|El Lagarto) \d{4})\s*:\s*/i;
const LIST = /^Especial(?: Lista)?\s*:\s*|^Especial\s+/i;

// Label of a "lista" by the post's category
const KIND = { Listas: "Lista", Artistas: "Artista", Conciertos: "Concierto", Festivales: "Festival", "Bandas Sonoras Originales": "Banda sonora" };

// "Grace, de Jeff Buckley" -> { title: "Grace", by: "Jeff Buckley" }
const split = (text) => {
  const at = text.lastIndexOf(", de ");
  return at > 0 ? { title: text.slice(0, at), by: text.slice(at + 5) } : { title: text };
};

// { type, label, title, by?, series? } or undefined for an ordinary post
export function specialOf(post) {
  const title = post.title ?? "";
  if (!/^Especial\b/i.test(title)) return undefined;
  if (ALBUM.test(title)) return { type: "album", label: "Álbum", ...split(title.replace(ALBUM, "")) };
  if (BSO.test(title)) return { type: "album", label: "Banda sonora", title: title.replace(BSO, "") };
  const series = SERIES.exec(title);
  if (series) return { type: "festival", label: "Festival", title: title.replace(/^Especial\s+/i, ""), series: series[1] };
  if (post.metadata?.category === "Festivales") return { type: "festival", label: "Festival", title: title.replace(LIST, "") };
  return { type: "lista", label: KIND[post.metadata?.category] ?? "Tema", title: title.replace(LIST, "") };
}

export const SPECIAL_TYPES = [
  { type: "album", name: "Álbumes", note: "Un disco entero, contado de principio a fin." },
  { type: "festival", name: "Festivales", note: "Los grupos de un festival, uno al día, y la crónica." },
  { type: "lista", name: "Listas y temas", note: "Versiones, bandas sonoras, aniversarios, canciones del verano…" },
];

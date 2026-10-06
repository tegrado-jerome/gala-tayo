export type ReplyLanguage = "english" | "taglish";

// Common Tagalog function words and gala slang. Place names rarely use these, so they tell language apart.
const TAGALOG_WORDS = new Set(
  "sa na ng nang mga ako ko mo ka kami tayo natin namin sila siya ikaw kayo ninyo saan ano anong paano bakit kailan sino masarap mura murang hindi di po opo naman lang ba kain kumain gusto pwede puwede tara kasi yung ang meron may wala malapit dito diyan doon dun ngayon bukas mamaya kahapon umuulan ulan maganda magandang pasyalan puntahan pupunta pumunta kasama pamilya barkada kaibigan tropa sulit gala lakad kainan inuman tipid gastos libre magkano ilan dapat sana talaga muna pa rin din daw raw nga kayang kaya mas sobra grabe sige oo hindi'y yan iyan ito iyon kami'y tayo'y mag ma nag lagi baka para pag kapag kumusta kamusta musta salamat ayos heto eto ganda gawin pasyal punta kainin".split(" ")
);

function words(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
}

export function tagalogWordCount(text: string): number {
  return words(text).filter((word) => TAGALOG_WORDS.has(word)).length;
}

/** The language a reply should mirror: any real Tagalog in the message means Taglish out. */
// Filipino words English speakers here use too ("cheap gala QC"); alone they don't make a message Taglish.
const LOANWORDS = new Set(["gala", "barkada", "tropa", "tara", "sulit", "kainan", "lakad"]);

export function detectLanguage(text: string): ReplyLanguage {
  const all = words(text);
  const hits = all.filter((word) => TAGALOG_WORDS.has(word));
  if (hits.length >= 2) return "taglish";
  return hits.length === 1 && !LOANWORDS.has(hits[0]) && all.length <= 6 ? "taglish" : "english";
}

/** The language an answer is written in. Answers are longer, so a share of Tagalog words is needed. */
export function answerLanguage(text: string): ReplyLanguage {
  const all = words(text.replace(/\*\*[^*]+\*\*/g, " "));
  const hits = all.filter((word) => TAGALOG_WORDS.has(word)).length;
  return hits >= 3 && hits / Math.max(all.length, 1) >= 0.06 ? "taglish" : "english";
}

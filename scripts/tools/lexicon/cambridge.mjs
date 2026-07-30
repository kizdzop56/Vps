// Разбор статей Cambridge Dictionary.
//
// Слово берётся из двух статей одного словаря:
//   • /dictionary/english/<slug>          → часть речи, британская IPA,
//                                            метка CEFR (English Vocabulary Profile),
//                                            примеры употребления;
//   • /dictionary/english-russian/<slug>  → русские переводы.
//
// Берём только то, что напечатано в статье. Нет метки уровня или нет русского
// перевода → слово в датасет не попадает (подберём другое), ничего не додумываем.
import { cachePath, fetchText, stripTags, decodeEntities, CEFR } from "./lib.mjs";

const EN = "https://dictionary.cambridge.org/dictionary/english/";
const EN_RU = "https://dictionary.cambridge.org/dictionary/english-russian/";

export function slugify(word) {
  return word.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Достаёт содержимое <span>, начиная с позиции открывающего тега, с учётом
// вложенных <span> (в транскрипции внутри лежат <span class="sp dsp">ə</span>).
function spanAt(html, openIdx) {
  const start = html.indexOf(">", openIdx);
  if (start === -1) return "";
  let depth = 1;
  let i = start + 1;
  const re = /<\/?span\b[^>]*>/g;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) return html.slice(start + 1, m.index);
    } else if (!m[0].endsWith("/>")) {
      depth++;
    }
  }
  return "";
}

function ukIpa(block) {
  // Британский вариант: <span class="uk dpron-i"> … <span class="ipa dipa …">…</span>.
  // Берём именно span с классом ipa: обёртка "pron dpron" рядом с сильной и
  // слабой формой (of → /ɒv/ strong, /əv/ weak) прихватывает лишний текст.
  const idx = block.indexOf('class="uk dpron-i"');
  const scope = idx === -1 ? block : block.slice(idx, idx + 2000);
  const p = scope.indexOf('class="ipa dipa');
  if (p === -1) return "";
  const raw = stripTags(spanAt(scope, scope.lastIndexOf("<span", p)));
  const ipa = raw.replace(/\s+/g, "").replace(/[/]/g, "");
  // подстраховка: в транскрипции не должно остаться служебных пометок
  return /(weak|strong|also|plural)/i.test(ipa) ? "" : ipa;
}

function cleanExample(text) {
  return text
    .replace(/\[[^\]]*\]/g, " ")          // пометки вида [ often passive ]
    .replace(/\s+([,.!?;:])/g, "$1")      // Cambridge ставит пробел перед знаком
    .replace(/\s+/g, " ")
    .trim();
}

function entryBlocks(html) {
  const parts = html.split(/<div class="pr entry-body__el"/).slice(1);
  return parts.length ? parts : [];
}

// ── монолингвальная статья: уровень, IPA, часть речи, примеры ────────────
export function parseEnglish(html, word) {
  if (!html) return null;
  const hw = (html.match(/<span class="hw dhw">([^<]+)<\/span>/) || [])[1];
  if (!hw || decodeEntities(hw).trim().toLowerCase() !== word.trim().toLowerCase()) return null;

  const blocks = entryBlocks(html);
  if (!blocks.length) return null;

  const senses = blocks.map((b) => ({
    pos: (b.match(/<span class="pos dpos"[^>]*>([^<]+)<\/span>/) || [])[1]?.trim() ?? "",
    ipa: ukIpa(b),
    levels: [...b.matchAll(/class="epp-xref[^"]*">\s*([ABC][12])\s*</g)].map((m) => m[1]),
    examples: [...b.matchAll(/<div class="examp dexamp">([\s\S]*?)<\/div>/g)].map((m) => cleanExample(stripTags(m[1]))),
  }));

  const levels = senses.flatMap((s) => s.levels).filter((l) => CEFR.includes(l));
  // Уровень слова — самый низкий из размеченных значений: именно на нём слово
  // впервые встречается ученику.
  levels.sort((a, b) => CEFR.indexOf(a) - CEFR.indexOf(b));

  const examples = [];
  for (const s of senses) for (const e of s.examples) if (e && !examples.includes(e)) examples.push(e);

  return {
    word,
    pos: senses.find((s) => s.pos)?.pos ?? "",
    ipa: senses.find((s) => s.ipa)?.ipa ?? "",
    cefr: levels[0] ?? "",
    examples,
  };
}

// ── двуязычная статья: русские переводы ──────────────────────────────────
export function parseRussian(html, word) {
  if (!html) return null;
  const hw = (html.match(/<span class="hw dhw">([^<]+)<\/span>/) || [])[1];
  if (!hw || decodeEntities(hw).trim().toLowerCase() !== word.trim().toLowerCase()) return null;

  const blocks = entryBlocks(html);
  const scope = blocks.length ? blocks.join("\n") : html;

  const out = [];
  for (const m of scope.matchAll(/<span class="trans dtrans[^"]*"[^>]*lang="ru"[^>]*>([^<]*)<\/span>/g)) {
    const t = decodeEntities(m[1]).replace(/\s+/g, " ").trim().replace(/[,;]$/, "");
    if (t && !out.includes(t)) out.push(t);
  }
  return { word, translations: out };
}

export async function fetchWord(word) {
  const slug = slugify(word);
  if (!slug) return null;

  const enHtml = await fetchText(EN + slug, {
    cacheFile: cachePath("cambridge-en", `${slug}.html`),
    headers: { Referer: "https://dictionary.cambridge.org/" },
    delayMs: 200,
  });
  const en = parseEnglish(enHtml, word);
  // Метка CEFR у Cambridge есть не у всех слов (English Vocabulary Profile
  // покрывает не весь словарь). Транскрипция и перевод обязательны, уровень —
  // нет: если метки нет, уровень возьмём из списков Oxford, тоже проверенных.
  if (!en || !en.ipa) return null;

  const ruHtml = await fetchText(EN_RU + slug, {
    cacheFile: cachePath("cambridge-ru", `${slug}.html`),
    headers: { Referer: "https://dictionary.cambridge.org/" },
    delayMs: 200,
  });
  const ru = parseRussian(ruHtml, word);
  if (!ru || !ru.translations.length) return null;

  return { ...en, translations: ru.translations };
}

// ── словосочетания, фразовые глаголы, идиомы ─────────────────────────────
// У фраз в Cambridge нет собственной транскрипции, поэтому IPA собирается из
// проверенных транскрипций слов-компонентов (так же устроены фразы в текущем
// датасете: "have breakfast" → /hæv ˈbrek.fəst/). Уровень, значение и примеры —
// из статьи.
export function parsePhraseEnglish(html, phrase) {
  if (!html) return null;
  const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] ?? "";
  if (!desc.toUpperCase().startsWith(phrase.toUpperCase().replace(/’/g, "'"))) return null;

  // Блок именно этой фразы, если он выделен; иначе вся страница (Cambridge
  // отдаёт страницу, сфокусированную на запрошенной фразе).
  let scope = html;
  const pv = html.indexOf('class="pv-body dpv-body"');
  const idm = html.indexOf('class="idiom-body didiom-body"');
  const start = pv !== -1 ? pv : idm;
  if (start !== -1) scope = html.slice(start, start + 20000);

  // Метка уровня у фразы есть не всегда; если её нет, уровень подставит
  // вызывающий код из тематического словаря Oxford (там у многословных статей
  // свой значок a1…c2).
  const cefr = (scope.match(/class="epp-xref[^"]*">\s*([ABC][12])\s*</) || [])[1] ?? "";

  const examples = [...scope.matchAll(/<div class="examp dexamp">([\s\S]*?)<\/div>/g)]
    .map((m) => cleanExample(stripTags(m[1])))
    .filter(Boolean);

  return { word: phrase, cefr: CEFR.includes(cefr) ? cefr : "", examples };
}

export async function fetchPhrase(phrase) {
  const slug = slugify(phrase);
  if (!slug) return null;

  const enHtml = await fetchText(EN + slug, {
    cacheFile: cachePath("cambridge-en", `${slug}.html`),
    headers: { Referer: "https://dictionary.cambridge.org/" },
    delayMs: 200,
  });
  const en = parsePhraseEnglish(enHtml, phrase);
  if (!en) return null;

  const ruHtml = await fetchText(EN_RU + slug, {
    cacheFile: cachePath("cambridge-ru", `${slug}.html`),
    headers: { Referer: "https://dictionary.cambridge.org/" },
    delayMs: 200,
  });
  if (!ruHtml) return null;
  const descRu = (ruHtml.match(/name="description" content="([^"]*)"/) || [])[1] ?? "";
  if (!descRu.toUpperCase().startsWith(phrase.toUpperCase().replace(/’/g, "'"))) return null;
  const ru = parseRussianLoose(ruHtml);
  if (!ru.length) return null;

  return { ...en, translations: ru };
}

// Для фраз заголовок статьи — базовое слово, поэтому переводы берём по всей
// странице (страница уже сфокусирована на запрошенной фразе — это проверено
// по meta description выше).
function parseRussianLoose(html) {
  const out = [];
  for (const m of html.matchAll(/<span class="trans dtrans[^"]*"[^>]*lang="ru"[^>]*>([^<]*)<\/span>/g)) {
    const t = decodeEntities(m[1]).replace(/\s+/g, " ").trim().replace(/[,;]$/, "");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

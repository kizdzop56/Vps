// ─────────────────────────────────────────────────────────────────────────────
// Неправильные глаголы: таблица форм с уровнями CEFR.
//
// ── Зачем уровень у каждого глагола ─────────────────────────────────────────
// По нему подбираются задания. Ученик A1 не должен встретить ни одного глагола
// выше своего уровня: смысл упражнения в том, чтобы закрепить формы, которые он
// уже видел в словах, а не знакомиться с новыми через грамматику. Поэтому
// распределение здесь по ЧАСТОТНОСТИ, а не по алфавиту: be, go, have на A1,
// withdraw и tread на C1.
//
// ── Почему формы — массивы ──────────────────────────────────────────────────
// У части глаголов два равноправных варианта: learned и learnt, got и gotten,
// dreamed и dreamt. Оба есть в учебниках, и объявлять один «правильным» значит
// спорить с учебником ученика. Верен любой из перечисленных.
//
// Первый элемент — тот, что показывается как эталонный ответ после ошибки.
// ─────────────────────────────────────────────────────────────────────────────

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export type IrregularVerb = {
  /** Первая форма (инфинитив без to). */
  base: string;
  /** Вторая форма — Past Simple. Первый вариант считается основным. */
  past: string[];
  /** Третья форма — Past Participle. */
  participle: string[];
  /** Перевод: нужен и в подсказке, и в разборе ошибки. */
  ru: string;
  level: CefrLevel;
};

export const IRREGULAR_VERBS: IrregularVerb[] = [
  // ── A1: без этих глаголов нельзя составить ни одной фразы ────────────────
  { base: "be", past: ["was", "were"], participle: ["been"], ru: "быть", level: "A1" },
  { base: "have", past: ["had"], participle: ["had"], ru: "иметь", level: "A1" },
  { base: "do", past: ["did"], participle: ["done"], ru: "делать", level: "A1" },
  { base: "go", past: ["went"], participle: ["gone"], ru: "идти, ехать", level: "A1" },
  { base: "say", past: ["said"], participle: ["said"], ru: "сказать", level: "A1" },
  { base: "get", past: ["got"], participle: ["got", "gotten"], ru: "получать", level: "A1" },
  { base: "make", past: ["made"], participle: ["made"], ru: "делать, создавать", level: "A1" },
  { base: "know", past: ["knew"], participle: ["known"], ru: "знать", level: "A1" },
  { base: "take", past: ["took"], participle: ["taken"], ru: "брать", level: "A1" },
  { base: "see", past: ["saw"], participle: ["seen"], ru: "видеть", level: "A1" },
  { base: "come", past: ["came"], participle: ["come"], ru: "приходить", level: "A1" },
  { base: "give", past: ["gave"], participle: ["given"], ru: "давать", level: "A1" },
  { base: "find", past: ["found"], participle: ["found"], ru: "находить", level: "A1" },
  { base: "tell", past: ["told"], participle: ["told"], ru: "рассказывать", level: "A1" },
  { base: "eat", past: ["ate"], participle: ["eaten"], ru: "есть", level: "A1" },
  { base: "drink", past: ["drank"], participle: ["drunk"], ru: "пить", level: "A1" },
  { base: "sleep", past: ["slept"], participle: ["slept"], ru: "спать", level: "A1" },
  { base: "run", past: ["ran"], participle: ["run"], ru: "бегать", level: "A1" },
  { base: "sit", past: ["sat"], participle: ["sat"], ru: "сидеть", level: "A1" },
  { base: "read", past: ["read"], participle: ["read"], ru: "читать", level: "A1" },
  { base: "write", past: ["wrote"], participle: ["written"], ru: "писать", level: "A1" },
  { base: "put", past: ["put"], participle: ["put"], ru: "класть", level: "A1" },

  // ── A2 ──────────────────────────────────────────────────────────────────
  { base: "buy", past: ["bought"], participle: ["bought"], ru: "покупать", level: "A2" },
  { base: "bring", past: ["brought"], participle: ["brought"], ru: "приносить", level: "A2" },
  { base: "begin", past: ["began"], participle: ["begun"], ru: "начинать", level: "A2" },
  { base: "break", past: ["broke"], participle: ["broken"], ru: "ломать", level: "A2" },
  { base: "build", past: ["built"], participle: ["built"], ru: "строить", level: "A2" },
  { base: "catch", past: ["caught"], participle: ["caught"], ru: "ловить", level: "A2" },
  { base: "choose", past: ["chose"], participle: ["chosen"], ru: "выбирать", level: "A2" },
  { base: "drive", past: ["drove"], participle: ["driven"], ru: "водить машину", level: "A2" },
  { base: "fall", past: ["fell"], participle: ["fallen"], ru: "падать", level: "A2" },
  { base: "feel", past: ["felt"], participle: ["felt"], ru: "чувствовать", level: "A2" },
  { base: "fly", past: ["flew"], participle: ["flown"], ru: "летать", level: "A2" },
  { base: "forget", past: ["forgot"], participle: ["forgotten"], ru: "забывать", level: "A2" },
  { base: "grow", past: ["grew"], participle: ["grown"], ru: "расти", level: "A2" },
  { base: "hear", past: ["heard"], participle: ["heard"], ru: "слышать", level: "A2" },
  { base: "keep", past: ["kept"], participle: ["kept"], ru: "хранить", level: "A2" },
  { base: "leave", past: ["left"], participle: ["left"], ru: "уходить, оставлять", level: "A2" },
  { base: "lose", past: ["lost"], participle: ["lost"], ru: "терять", level: "A2" },
  { base: "meet", past: ["met"], participle: ["met"], ru: "встречать", level: "A2" },
  { base: "pay", past: ["paid"], participle: ["paid"], ru: "платить", level: "A2" },
  { base: "sell", past: ["sold"], participle: ["sold"], ru: "продавать", level: "A2" },
  { base: "send", past: ["sent"], participle: ["sent"], ru: "отправлять", level: "A2" },
  { base: "sing", past: ["sang"], participle: ["sung"], ru: "петь", level: "A2" },
  { base: "speak", past: ["spoke"], participle: ["spoken"], ru: "говорить", level: "A2" },
  { base: "spend", past: ["spent"], participle: ["spent"], ru: "тратить", level: "A2" },
  { base: "swim", past: ["swam"], participle: ["swum"], ru: "плавать", level: "A2" },
  { base: "teach", past: ["taught"], participle: ["taught"], ru: "учить, преподавать", level: "A2" },
  { base: "understand", past: ["understood"], participle: ["understood"], ru: "понимать", level: "A2" },
  { base: "wear", past: ["wore"], participle: ["worn"], ru: "носить одежду", level: "A2" },
  { base: "win", past: ["won"], participle: ["won"], ru: "побеждать", level: "A2" },
  { base: "stand", past: ["stood"], participle: ["stood"], ru: "стоять", level: "A2" },
  { base: "cut", past: ["cut"], participle: ["cut"], ru: "резать", level: "A2" },
  { base: "cost", past: ["cost"], participle: ["cost"], ru: "стоить", level: "A2" },

  // ── B1 ──────────────────────────────────────────────────────────────────
  { base: "beat", past: ["beat"], participle: ["beaten"], ru: "бить, побеждать", level: "B1" },
  { base: "bite", past: ["bit"], participle: ["bitten"], ru: "кусать", level: "B1" },
  { base: "blow", past: ["blew"], participle: ["blown"], ru: "дуть", level: "B1" },
  { base: "burn", past: ["burnt", "burned"], participle: ["burnt", "burned"], ru: "горит, сжигать", level: "B1" },
  { base: "deal", past: ["dealt"], participle: ["dealt"], ru: "иметь дело", level: "B1" },
  { base: "dig", past: ["dug"], participle: ["dug"], ru: "копать", level: "B1" },
  { base: "draw", past: ["drew"], participle: ["drawn"], ru: "рисовать", level: "B1" },
  { base: "feed", past: ["fed"], participle: ["fed"], ru: "кормить", level: "B1" },
  { base: "fight", past: ["fought"], participle: ["fought"], ru: "драться", level: "B1" },
  { base: "freeze", past: ["froze"], participle: ["frozen"], ru: "замерзать", level: "B1" },
  { base: "hang", past: ["hung"], participle: ["hung"], ru: "висеть, вешать", level: "B1" },
  { base: "hide", past: ["hid"], participle: ["hidden"], ru: "прятать", level: "B1" },
  { base: "hold", past: ["held"], participle: ["held"], ru: "держать", level: "B1" },
  { base: "hurt", past: ["hurt"], participle: ["hurt"], ru: "причинять боль", level: "B1" },
  { base: "lend", past: ["lent"], participle: ["lent"], ru: "давать в долг", level: "B1" },
  { base: "mean", past: ["meant"], participle: ["meant"], ru: "значить", level: "B1" },
  { base: "ride", past: ["rode"], participle: ["ridden"], ru: "ездить верхом", level: "B1" },
  { base: "ring", past: ["rang"], participle: ["rung"], ru: "звонить", level: "B1" },
  { base: "rise", past: ["rose"], participle: ["risen"], ru: "подниматься", level: "B1" },
  { base: "shake", past: ["shook"], participle: ["shaken"], ru: "трясти", level: "B1" },
  { base: "shine", past: ["shone"], participle: ["shone"], ru: "светить", level: "B1" },
  { base: "shoot", past: ["shot"], participle: ["shot"], ru: "стрелять", level: "B1" },
  { base: "shut", past: ["shut"], participle: ["shut"], ru: "закрывать", level: "B1" },
  { base: "steal", past: ["stole"], participle: ["stolen"], ru: "красть", level: "B1" },
  { base: "stick", past: ["stuck"], participle: ["stuck"], ru: "приклеивать, застрять", level: "B1" },
  { base: "throw", past: ["threw"], participle: ["thrown"], ru: "бросать", level: "B1" },
  { base: "wake", past: ["woke"], participle: ["woken"], ru: "будить, просыпаться", level: "B1" },
  { base: "tear", past: ["tore"], participle: ["torn"], ru: "рвать", level: "B1" },
  { base: "lay", past: ["laid"], participle: ["laid"], ru: "класть", level: "B1" },
  { base: "lie", past: ["lay"], participle: ["lain"], ru: "лежать", level: "B1" },

  // ── B2 ──────────────────────────────────────────────────────────────────
  { base: "bend", past: ["bent"], participle: ["bent"], ru: "сгибать", level: "B2" },
  { base: "bet", past: ["bet"], participle: ["bet"], ru: "спорить на деньги", level: "B2" },
  { base: "bind", past: ["bound"], participle: ["bound"], ru: "связывать", level: "B2" },
  { base: "forbid", past: ["forbade"], participle: ["forbidden"], ru: "запрещать", level: "B2" },
  { base: "forgive", past: ["forgave"], participle: ["forgiven"], ru: "прощать", level: "B2" },
  { base: "grind", past: ["ground"], participle: ["ground"], ru: "молоть", level: "B2" },
  { base: "kneel", past: ["knelt"], participle: ["knelt"], ru: "вставать на колени", level: "B2" },
  { base: "leap", past: ["leapt", "leaped"], participle: ["leapt", "leaped"], ru: "прыгать", level: "B2" },
  { base: "seek", past: ["sought"], participle: ["sought"], ru: "искать", level: "B2" },
  { base: "sew", past: ["sewed"], participle: ["sewn", "sewed"], ru: "шить", level: "B2" },
  { base: "shed", past: ["shed"], participle: ["shed"], ru: "сбрасывать", level: "B2" },
  { base: "slide", past: ["slid"], participle: ["slid"], ru: "скользить", level: "B2" },
  { base: "spin", past: ["spun"], participle: ["spun"], ru: "крутить", level: "B2" },
  { base: "split", past: ["split"], participle: ["split"], ru: "разделять", level: "B2" },
  { base: "spread", past: ["spread"], participle: ["spread"], ru: "распространять", level: "B2" },
  { base: "sting", past: ["stung"], participle: ["stung"], ru: "жалить", level: "B2" },
  { base: "swear", past: ["swore"], participle: ["sworn"], ru: "клясться", level: "B2" },
  { base: "sweep", past: ["swept"], participle: ["swept"], ru: "подметать", level: "B2" },
  { base: "swing", past: ["swung"], participle: ["swung"], ru: "качаться", level: "B2" },
  { base: "weep", past: ["wept"], participle: ["wept"], ru: "плакать", level: "B2" },

  // ── C1 ──────────────────────────────────────────────────────────────────
  { base: "arise", past: ["arose"], participle: ["arisen"], ru: "возникать", level: "C1" },
  { base: "breed", past: ["bred"], participle: ["bred"], ru: "разводить животных", level: "C1" },
  { base: "cling", past: ["clung"], participle: ["clung"], ru: "цепляться", level: "C1" },
  { base: "creep", past: ["crept"], participle: ["crept"], ru: "ползти", level: "C1" },
  { base: "flee", past: ["fled"], participle: ["fled"], ru: "убегать", level: "C1" },
  { base: "mislead", past: ["misled"], participle: ["misled"], ru: "вводить в заблуждение", level: "C1" },
  { base: "overcome", past: ["overcame"], participle: ["overcome"], ru: "преодолевать", level: "C1" },
  { base: "thrust", past: ["thrust"], participle: ["thrust"], ru: "толкать", level: "C1" },
  { base: "tread", past: ["trod"], participle: ["trodden"], ru: "ступать", level: "C1" },
  { base: "withdraw", past: ["withdrew"], participle: ["withdrawn"], ru: "изымать, отступать", level: "C1" },
];

/** Порядок уровней. Совпадает с CEFR_ORDER на стороне карточек. */
export const LEVEL_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

/** Уровень не выше указанного: своё и всё, что ниже. */
export function fitsLevel(itemLevel: CefrLevel, userLevel: CefrLevel): boolean {
  return LEVEL_ORDER.indexOf(itemLevel) <= LEVEL_ORDER.indexOf(userLevel);
}

const BY_BASE = new Map(IRREGULAR_VERBS.map((v) => [v.base, v]));

export function verbByBase(base: string): IrregularVerb | undefined {
  return BY_BASE.get(base.trim().toLowerCase());
}

/** Глаголы уровня ученика и ниже. */
export function verbsUpTo(level: CefrLevel): IrregularVerb[] {
  return IRREGULAR_VERBS.filter((v) => fitsLevel(v.level, level));
}

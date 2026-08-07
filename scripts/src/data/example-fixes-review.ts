// Правки после вычитки: русский по смыслу, а не по глоссе каталога.
//
// Пофайловые словари (example-fixes-{level}.ts) заполнялись быстро, и в девяти
// местах русский оказался подогнан под глоссу карточки вместо смысла самого
// предложения: «Это фотография из моей семьи» (of), «очень сильно холодно»
// (extremely), «приспособление романа для кино» (adaptation). Для ученика
// перевод примера — образец живой речи, поэтому такая кривизна дороже, чем в
// словарной статье.
//
// Почему отдельным файлом, а не правкой на месте: словари уровней большие, и
// переписывать их целиком ради девяти строк — лишний риск задеть соседние
// записи. Этот слой накладывается последним и при совпадении ключей побеждает;
// pnpm validate:examples показывает, что именно он перекрыл.
import type { ExampleFix } from "./example-fixes";

export const REVIEW_FIXES: Record<string, ExampleFix> = {
  // калька с английской конструкции
  of: { exEn: "This is a photo of my family.", exRu: "Это фотография моей семьи.", pos: "preposition" },
  the: { exEn: "Please close the window.", exRu: "Пожалуйста, закрой окно.", pos: "article" },
  pass: { exEn: "We pass the school on the way home.", exRu: "По дороге домой мы проходим мимо школы.", pos: "verb" },

  // перевод подогнан под глоссу карточки, а не под предложение
  extremely: { exEn: "It is extremely cold today.", exRu: "Сегодня крайне холодно." },
  facility: { exEn: "The school has a new sports facility.", exRu: "У школы новый спорткомплекс." },
  adaptation: { exEn: "The film is an adaptation of a novel.", exRu: "Фильм — экранизация романа." },
  instrumental: { exEn: "He was instrumental in saving the library.", exRu: "Он сыграл важную роль в спасении библиотеки.", pos: "adjective" },
  scope: { exEn: "This question is beyond the scope of the lesson.", exRu: "Этот вопрос выходит за рамки урока." },

  // часть речи примера не совпала с карточкой
  vicious: { exEn: "The dog gave a vicious bite.", exRu: "Собака нанесла беспощадный укус.", pos: "adjective" },
};

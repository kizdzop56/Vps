// Базовые карточки многозначных слов: пример показывает ПЕРВЫЙ смысл.
//
// Пара к sense-phrases.ts. Там второе значение слова выносится в отдельную
// карточку-фразу (chest → a treasure chest), а здесь чинится сама базовая
// карточка: её пример обязан показывать тот смысл, который написан в переводе.
// Иначе вынос фразы ничего не лечит — ученик по-прежнему видит перевод от
// одного значения и пример от другого, только теперь в двух местах.
//
// В каталоге примеров таких хватало: watch «смотреть» с примером про наручные
// часы, glass «стекло» про стакан воды, bank «банк» про банк крови, class
// «сорт» с определением из словаря, court «суд» про игру на площадке, interest
// «интерес» про годовую ставку 5%.
//
// Почему отдельным файлом, а не в example-fixes-{level}.ts: многозначное слово
// удобнее держать одним куском — базовый смысл здесь, вынесенный во фразу
// рядом в sense-phrases.ts. Слой применяется последним и при пересечении
// ключей побеждает: example-fixes правит примеры вслепую по слову и про второе
// значение не знает. Проверка (у каждого слова есть парная фраза) —
// pnpm validate:examples.
import type { ExampleFix } from "./example-fixes";

export const SENSE_BASE_FIXES: Record<string, ExampleFix> = {
  // A1
  glass: { exEn: "The window is made of glass.", exRu: "Окно сделано из стекла.", pos: "noun" },
  point: { exEn: "Put a point at the end of the sentence.", exRu: "Поставь точку в конце предложения.", pos: "noun" },
  watch: { exEn: "We watch a film every Friday.", exRu: "Мы смотрим фильм каждую пятницу.", pos: "verb" },
  match: { exEn: "These two socks do not match.", exRu: "Эти два носка не соответствуют друг другу.", pos: "verb" },
  class: { exEn: "This hotel is of the highest class.", exRu: "Этот отель самого высокого сорта.", pos: "noun" },
  change: { exEn: "We changed the plan at the last minute.", exRu: "Мы изменили план в последнюю минуту.", pos: "verb" },
  play: { exEn: "They play in the yard after school.", exRu: "Они играют во дворе после школы.", pos: "verb" },
  cook: { exEn: "I cook dinner for the family every day.", exRu: "Я готовлю ужин для семьи каждый день.", pos: "verb" },
  bank: { exEn: "I keep my money in the bank.", exRu: "Я держу свои деньги в банке.", pos: "noun" },
  present: { exEn: "She gave me a present for my birthday.", exRu: "Она подарила мне подарок на день рождения.", pos: "noun" },
  second: { exEn: "He was the second to finish the race.", exRu: "Он был вторым, кто закончил гонку.", pos: "adjective" },
  interest: { exEn: "He has a great interest in space.", exRu: "У него большой интерес к космосу.", pos: "noun" },

  // A2
  fall: { exEn: "Be careful, you can fall on the ice.", exRu: "Осторожно, ты можешь упасть на льду.", pos: "verb" },
  lock: { exEn: "The lock on the door is broken.", exRu: "Замок на двери сломан.", pos: "noun" },
  character: { exEn: "She has a strong character.", exRu: "У неё сильный характер.", pos: "noun" },
  run: { exEn: "The children run in the park every evening.", exRu: "Дети бегают в парке каждый вечер.", pos: "verb" },

  // B1
  court: { exEn: "The court decided that he was not guilty.", exRu: "Суд решил, что он не виновен.", pos: "noun" },
  rise: { exEn: "There was a sharp rise in prices.", exRu: "Был резкий рост цен.", pos: "noun" },
  shift: { exEn: "There was a shift in his opinion after the talk.", exRu: "После разговора в его мнении произошёл сдвиг.", pos: "noun" },
  supply: { exEn: "The farm supplies milk to the whole village.", exRu: "Ферма поставляет молоко всей деревне.", pos: "verb" },
  deal: { exEn: "I do not want to deal with this problem now.", exRu: "Я не хочу иметь дело с этой проблемой сейчас.", pos: "verb" },
  value: { exEn: "I value your advice.", exRu: "Я ценю твой совет.", pos: "verb" },
};

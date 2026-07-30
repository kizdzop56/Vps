// ─────────────────────────────────────────────────────────────────────────────
// Офлайн-датасет для готовых (системных) колод флеш-карточек.
// Все данные самодостаточны (без рантайм-API): перевод(ы) RU, IPA-транскрипция,
// пример EN + перевод RU, уровень CEFR. Озвучка — Web Speech API на клиенте.
//
// Используется сид-скриптом scripts/src/seed-flashcards.ts (идемпотентно).
// Дополнять новые колоды/слова можно здесь же или импортом CSV/JSON в приложении.
// ─────────────────────────────────────────────────────────────────────────────

export type SeedWord = {
  en: string;
  pos: string;          // part of speech: noun/verb/adj/...
  ru: string[];         // переводы
  ipa: string;          // транскрипция
  exEn: string;         // пример на английском
  exRu: string;         // перевод примера
  cefr: string;         // A1..C2
};

export type SeedDeck = {
  theme: string;        // стабильный ключ
  title: string;        // рус. название
  emoji: string;
  description: string;
  cefrLevel?: string;   // для колод «Топ-слова A1/...»
  words: SeedWord[];
};

export const SEED_DECKS: SeedDeck[] = [
  // ─── Еда и напитки ──────────────────────────────────────────────
  {
    theme: "food",
    title: "Еда и напитки",
    emoji: "🍔",
    description: "Базовые слова о еде, напитках и приёме пищи.",
    words: [
      { en: "apple", pos: "noun", ru: ["яблоко"], ipa: "/ˈæp.əl/", exEn: "I eat an apple every morning.", exRu: "Я ем яблоко каждое утро.", cefr: "A1" },
      { en: "bread", pos: "noun", ru: ["хлеб"], ipa: "/bred/", exEn: "She bought fresh bread at the shop.", exRu: "Она купила свежий хлеб в магазине.", cefr: "A1" },
      { en: "water", pos: "noun", ru: ["вода"], ipa: "/ˈwɔː.tər/", exEn: "Can I have a glass of water, please?", exRu: "Можно мне стакан воды, пожалуйста?", cefr: "A1" },
      { en: "milk", pos: "noun", ru: ["молоко"], ipa: "/mɪlk/", exEn: "He drinks milk with his breakfast.", exRu: "Он пьёт молоко на завтрак.", cefr: "A1" },
      { en: "cheese", pos: "noun", ru: ["сыр"], ipa: "/tʃiːz/", exEn: "This pizza has a lot of cheese.", exRu: "На этой пицце много сыра.", cefr: "A1" },
      { en: "egg", pos: "noun", ru: ["яйцо"], ipa: "/eɡ/", exEn: "I would like two eggs for breakfast.", exRu: "Я бы хотел два яйца на завтрак.", cefr: "A1" },
      { en: "meat", pos: "noun", ru: ["мясо"], ipa: "/miːt/", exEn: "They do not eat meat.", exRu: "Они не едят мясо.", cefr: "A1" },
      { en: "vegetable", pos: "noun", ru: ["овощ"], ipa: "/ˈvedʒ.tə.bəl/", exEn: "Carrots are my favourite vegetable.", exRu: "Морковь — мой любимый овощ.", cefr: "A2" },
      { en: "fruit", pos: "noun", ru: ["фрукт"], ipa: "/fruːt/", exEn: "Fruit is good for your health.", exRu: "Фрукты полезны для здоровья.", cefr: "A1" },
      { en: "breakfast", pos: "noun", ru: ["завтрак"], ipa: "/ˈbrek.fəst/", exEn: "We have breakfast at eight o'clock.", exRu: "Мы завтракаем в восемь часов.", cefr: "A1" },
      { en: "dinner", pos: "noun", ru: ["ужин"], ipa: "/ˈdɪn.ər/", exEn: "Dinner is ready!", exRu: "Ужин готов!", cefr: "A1" },
      { en: "delicious", pos: "adjective", ru: ["вкусный"], ipa: "/dɪˈlɪʃ.əs/", exEn: "The soup was absolutely delicious.", exRu: "Суп был просто восхитительным.", cefr: "A2" },
      { en: "hungry", pos: "adjective", ru: ["голодный"], ipa: "/ˈhʌŋ.ɡri/", exEn: "I'm hungry — let's eat.", exRu: "Я голоден — давай поедим.", cefr: "A1" },
      { en: "taste", pos: "verb", ru: ["пробовать", "иметь вкус"], ipa: "/teɪst/", exEn: "Taste this and tell me what you think.", exRu: "Попробуй это и скажи, что думаешь.", cefr: "A2" },
      { en: "recipe", pos: "noun", ru: ["рецепт"], ipa: "/ˈres.ɪ.pi/", exEn: "This is my grandmother's recipe.", exRu: "Это рецепт моей бабушки.", cefr: "B1" },
      { en: "meal", pos: "noun", ru: ["приём пищи", "блюдо"], ipa: "/miːl/", exEn: "It was the best meal of my life.", exRu: "Это была лучшая еда в моей жизни.", cefr: "A2" },
      { en: "sugar", pos: "noun", ru: ["сахар"], ipa: "/ˈʃʊɡ.ər/", exEn: "Do you take sugar in your coffee?", exRu: "Ты кладёшь сахар в кофе?", cefr: "A1" },
      { en: "salt", pos: "noun", ru: ["соль"], ipa: "/sɒlt/", exEn: "Add a little salt to the soup.", exRu: "Добавь немного соли в суп.", cefr: "A1" },
      // словосочетания и фразеологизмы
      { en: "have breakfast", pos: "collocation", ru: ["завтракать"], ipa: "/hæv ˈbrek.fəst/", exEn: "We have breakfast together every Sunday.", exRu: "Мы завтракаем вместе каждое воскресенье.", cefr: "A1" },
      { en: "fast food", pos: "collocation", ru: ["фастфуд", "быстрая еда"], ipa: "/ˌfɑːst ˈfuːd/", exEn: "Too much fast food is bad for you.", exRu: "Слишком много фастфуда вредно.", cefr: "A1" },
      { en: "eat out", pos: "phrasal verb", ru: ["есть вне дома", "ходить в ресторан"], ipa: "/iːt ˈaʊt/", exEn: "We eat out once a week.", exRu: "Мы ходим в ресторан раз в неделю.", cefr: "A2" },
      { en: "a piece of cake", pos: "idiom", ru: ["проще простого", "пустяк"], ipa: "/ə ˌpiːs əv ˈkeɪk/", exEn: "The test was a piece of cake.", exRu: "Тест был проще простого.", cefr: "B1" },
      { en: "food for thought", pos: "idiom", ru: ["пища для размышлений"], ipa: "/ˌfuːd fə ˈθɔːt/", exEn: "Her lecture gave me food for thought.", exRu: "Её лекция дала мне пищу для размышлений.", cefr: "B2" },
    ],
  },

  // ─── Животные ───────────────────────────────────────────────────
  {
    theme: "animals",
    title: "Животные",
    emoji: "🐾",
    description: "Домашние и дикие животные.",
    words: [
      { en: "dog", pos: "noun", ru: ["собака"], ipa: "/dɒɡ/", exEn: "The dog is sleeping on the sofa.", exRu: "Собака спит на диване.", cefr: "A1" },
      { en: "cat", pos: "noun", ru: ["кошка"], ipa: "/kæt/", exEn: "My cat likes to play with a ball.", exRu: "Моя кошка любит играть с мячиком.", cefr: "A1" },
      { en: "horse", pos: "noun", ru: ["лошадь"], ipa: "/hɔːs/", exEn: "She rides a horse every weekend.", exRu: "Она катается на лошади каждые выходные.", cefr: "A1" },
      { en: "bird", pos: "noun", ru: ["птица"], ipa: "/bɜːd/", exEn: "A small bird sat on the branch.", exRu: "Маленькая птица села на ветку.", cefr: "A1" },
      { en: "fish", pos: "noun", ru: ["рыба"], ipa: "/fɪʃ/", exEn: "There are many fish in this lake.", exRu: "В этом озере много рыбы.", cefr: "A1" },
      { en: "cow", pos: "noun", ru: ["корова"], ipa: "/kaʊ/", exEn: "The cow gives us milk.", exRu: "Корова даёт нам молоко.", cefr: "A1" },
      { en: "sheep", pos: "noun", ru: ["овца"], ipa: "/ʃiːp/", exEn: "The farmer has fifty sheep.", exRu: "У фермера пятьдесят овец.", cefr: "A1" },
      { en: "bear", pos: "noun", ru: ["медведь"], ipa: "/beər/", exEn: "A brown bear lives in the forest.", exRu: "Бурый медведь живёт в лесу.", cefr: "A2" },
      { en: "lion", pos: "noun", ru: ["лев"], ipa: "/ˈlaɪ.ən/", exEn: "The lion is the king of animals.", exRu: "Лев — царь зверей.", cefr: "A2" },
      { en: "elephant", pos: "noun", ru: ["слон"], ipa: "/ˈel.ɪ.fənt/", exEn: "An elephant never forgets.", exRu: "Слон никогда не забывает.", cefr: "A2" },
      { en: "rabbit", pos: "noun", ru: ["кролик"], ipa: "/ˈræb.ɪt/", exEn: "The rabbit ran across the garden.", exRu: "Кролик пробежал через сад.", cefr: "A1" },
      { en: "mouse", pos: "noun", ru: ["мышь"], ipa: "/maʊs/", exEn: "The cat is chasing a mouse.", exRu: "Кошка гонится за мышью.", cefr: "A1" },
      { en: "snake", pos: "noun", ru: ["змея"], ipa: "/sneɪk/", exEn: "That snake is not dangerous.", exRu: "Эта змея не опасна.", cefr: "A2" },
      { en: "wolf", pos: "noun", ru: ["волк"], ipa: "/wʊlf/", exEn: "A wolf howled in the distance.", exRu: "Вдалеке выл волк.", cefr: "B1" },
      { en: "insect", pos: "noun", ru: ["насекомое"], ipa: "/ˈɪn.sekt/", exEn: "A bee is a useful insect.", exRu: "Пчела — полезное насекомое.", cefr: "A2" },
      { en: "wild", pos: "adjective", ru: ["дикий"], ipa: "/waɪld/", exEn: "These are wild animals, not pets.", exRu: "Это дикие животные, а не питомцы.", cefr: "A2" },
      // словосочетания и фразеологизмы
      { en: "wild animal", pos: "collocation", ru: ["дикое животное"], ipa: "/ˌwaɪld ˈæn.ɪ.məl/", exEn: "A fox is a wild animal.", exRu: "Лиса — дикое животное.", cefr: "A1" },
      { en: "take the dog for a walk", pos: "collocation", ru: ["выгуливать собаку"], ipa: "/ˌteɪk ðə ˈdɒɡ fər ə ˈwɔːk/", exEn: "I take the dog for a walk after school.", exRu: "Я выгуливаю собаку после школы.", cefr: "A2" },
      { en: "it's raining cats and dogs", pos: "idiom", ru: ["льёт как из ведра"], ipa: "/ɪts ˈreɪ.nɪŋ ˌkæts ən ˈdɒɡz/", exEn: "Take an umbrella — it's raining cats and dogs.", exRu: "Возьми зонт — льёт как из ведра.", cefr: "B1" },
      { en: "let the cat out of the bag", pos: "idiom", ru: ["выдать секрет", "проболтаться"], ipa: "/ˌlet ðə ˈkæt ˌaʊt əv ðə ˈbæɡ/", exEn: "Don't let the cat out of the bag about the party.", exRu: "Не выдай секрет про вечеринку.", cefr: "B2" },
      { en: "a bird's-eye view", pos: "idiom", ru: ["вид с высоты птичьего полёта"], ipa: "/ə ˌbɜːdz aɪ ˈvjuː/", exEn: "From the tower you get a bird's-eye view of the city.", exRu: "С башни город виден как с высоты птичьего полёта.", cefr: "B2" },
    ],
  },

  // ─── Транспорт ──────────────────────────────────────────────────
  {
    theme: "transport",
    title: "Транспорт",
    emoji: "🚗",
    description: "Виды транспорта и передвижение.",
    words: [
      { en: "car", pos: "noun", ru: ["машина", "автомобиль"], ipa: "/kɑːr/", exEn: "They travel to work by car.", exRu: "Они ездят на работу на машине.", cefr: "A1" },
      { en: "bus", pos: "noun", ru: ["автобус"], ipa: "/bʌs/", exEn: "I take the bus to school.", exRu: "Я езжу в школу на автобусе.", cefr: "A1" },
      { en: "train", pos: "noun", ru: ["поезд"], ipa: "/treɪn/", exEn: "The train leaves at noon.", exRu: "Поезд отправляется в полдень.", cefr: "A1" },
      { en: "plane", pos: "noun", ru: ["самолёт"], ipa: "/pleɪn/", exEn: "Our plane lands in two hours.", exRu: "Наш самолёт приземлится через два часа.", cefr: "A1" },
      { en: "bicycle", pos: "noun", ru: ["велосипед"], ipa: "/ˈbaɪ.sɪ.kəl/", exEn: "He rides his bicycle to work.", exRu: "Он ездит на работу на велосипеде.", cefr: "A1" },
      { en: "ship", pos: "noun", ru: ["корабль"], ipa: "/ʃɪp/", exEn: "The ship sailed across the ocean.", exRu: "Корабль плыл через океан.", cefr: "A2" },
      { en: "taxi", pos: "noun", ru: ["такси"], ipa: "/ˈtæk.si/", exEn: "Let's take a taxi, it's faster.", exRu: "Давай возьмём такси, так быстрее.", cefr: "A1" },
      { en: "ticket", pos: "noun", ru: ["билет"], ipa: "/ˈtɪk.ɪt/", exEn: "I bought a ticket for the train.", exRu: "Я купил билет на поезд.", cefr: "A1" },
      { en: "station", pos: "noun", ru: ["станция", "вокзал"], ipa: "/ˈsteɪ.ʃən/", exEn: "We met at the station.", exRu: "Мы встретились на вокзале.", cefr: "A2" },
      { en: "airport", pos: "noun", ru: ["аэропорт"], ipa: "/ˈeə.pɔːt/", exEn: "The airport is far from the city.", exRu: "Аэропорт далеко от города.", cefr: "A2" },
      { en: "drive", pos: "verb", ru: ["водить", "ехать"], ipa: "/draɪv/", exEn: "Can you drive a car?", exRu: "Ты умеешь водить машину?", cefr: "A1" },
      { en: "traffic", pos: "noun", ru: ["движение", "трафик"], ipa: "/ˈtræf.ɪk/", exEn: "There is heavy traffic this morning.", exRu: "Сегодня утром большие пробки.", cefr: "B1" },
      { en: "road", pos: "noun", ru: ["дорога"], ipa: "/rəʊd/", exEn: "This road leads to the sea.", exRu: "Эта дорога ведёт к морю.", cefr: "A1" },
      { en: "journey", pos: "noun", ru: ["путешествие", "поездка"], ipa: "/ˈdʒɜː.ni/", exEn: "The journey took six hours.", exRu: "Поездка заняла шесть часов.", cefr: "B1" },
      { en: "arrive", pos: "verb", ru: ["прибывать", "приезжать"], ipa: "/əˈraɪv/", exEn: "We will arrive before dark.", exRu: "Мы приедем до темноты.", cefr: "A2" },
      // словосочетания и фразеологизмы
      { en: "by bus", pos: "collocation", ru: ["на автобусе"], ipa: "/baɪ ˈbʌs/", exEn: "I go to school by bus.", exRu: "Я езжу в школу на автобусе.", cefr: "A1" },
      { en: "get on", pos: "phrasal verb", ru: ["садиться в транспорт"], ipa: "/ˌɡet ˈɒn/", exEn: "We got on the train in Berlin.", exRu: "Мы сели в поезд в Берлине.", cefr: "A2" },
      { en: "miss the train", pos: "collocation", ru: ["опоздать на поезд"], ipa: "/ˌmɪs ðə ˈtreɪn/", exEn: "Hurry up or we will miss the train.", exRu: "Поторопись, иначе опоздаем на поезд.", cefr: "A2" },
      { en: "traffic jam", pos: "collocation", ru: ["пробка на дороге"], ipa: "/ˈtræf.ɪk ˌdʒæm/", exEn: "We were stuck in a traffic jam for an hour.", exRu: "Мы стояли в пробке час.", cefr: "A2" },
      { en: "hit the road", pos: "idiom", ru: ["отправиться в путь"], ipa: "/ˌhɪt ðə ˈrəʊd/", exEn: "It's late — time to hit the road.", exRu: "Уже поздно — пора отправляться в путь.", cefr: "B2" },
    ],
  },

  // ─── Семья ──────────────────────────────────────────────────────
  {
    theme: "family",
    title: "Семья",
    emoji: "👨‍👩‍👧",
    description: "Члены семьи и родственные связи.",
    words: [
      { en: "mother", pos: "noun", ru: ["мать", "мама"], ipa: "/ˈmʌð.ər/", exEn: "My mother works as a doctor.", exRu: "Моя мама работает врачом.", cefr: "A1" },
      { en: "father", pos: "noun", ru: ["отец", "папа"], ipa: "/ˈfɑː.ðər/", exEn: "His father is a teacher.", exRu: "Его отец — учитель.", cefr: "A1" },
      { en: "sister", pos: "noun", ru: ["сестра"], ipa: "/ˈsɪs.tər/", exEn: "I have one sister and two brothers.", exRu: "У меня есть одна сестра и два брата.", cefr: "A1" },
      { en: "brother", pos: "noun", ru: ["брат"], ipa: "/ˈbrʌð.ər/", exEn: "My brother is older than me.", exRu: "Мой брат старше меня.", cefr: "A1" },
      { en: "parents", pos: "noun", ru: ["родители"], ipa: "/ˈpeə.rənts/", exEn: "My parents live in another city.", exRu: "Мои родители живут в другом городе.", cefr: "A1" },
      { en: "child", pos: "noun", ru: ["ребёнок"], ipa: "/tʃaɪld/", exEn: "The child is playing outside.", exRu: "Ребёнок играет на улице.", cefr: "A1" },
      { en: "daughter", pos: "noun", ru: ["дочь"], ipa: "/ˈdɔː.tər/", exEn: "Their daughter goes to university.", exRu: "Их дочь учится в университете.", cefr: "A1" },
      { en: "son", pos: "noun", ru: ["сын"], ipa: "/sʌn/", exEn: "Her son is five years old.", exRu: "Её сыну пять лет.", cefr: "A1" },
      { en: "grandmother", pos: "noun", ru: ["бабушка"], ipa: "/ˈɡræn.mʌð.ər/", exEn: "My grandmother tells great stories.", exRu: "Моя бабушка рассказывает отличные истории.", cefr: "A1" },
      { en: "husband", pos: "noun", ru: ["муж"], ipa: "/ˈhʌz.bənd/", exEn: "Her husband cooks every evening.", exRu: "Её муж готовит каждый вечер.", cefr: "A2" },
      { en: "wife", pos: "noun", ru: ["жена"], ipa: "/waɪf/", exEn: "His wife works from home.", exRu: "Его жена работает из дома.", cefr: "A2" },
      { en: "relative", pos: "noun", ru: ["родственник"], ipa: "/ˈrel.ə.tɪv/", exEn: "We visit our relatives at New Year.", exRu: "Мы навещаем родственников на Новый год.", cefr: "B1" },
      { en: "married", pos: "adjective", ru: ["женатый", "замужняя"], ipa: "/ˈmær.id/", exEn: "They have been married for ten years.", exRu: "Они женаты уже десять лет.", cefr: "A2" },
      { en: "grow up", pos: "phrasal verb", ru: ["взрослеть", "расти"], ipa: "/ɡrəʊ ʌp/", exEn: "I grew up in a small village.", exRu: "Я вырос в маленькой деревне.", cefr: "B1" },
      // словосочетания и фразеологизмы
      { en: "get married", pos: "collocation", ru: ["жениться", "выйти замуж"], ipa: "/ˌɡet ˈmær.id/", exEn: "They got married last summer.", exRu: "Они поженились прошлым летом.", cefr: "A2" },
      { en: "take after", pos: "phrasal verb", ru: ["быть похожим на родственника"], ipa: "/ˈteɪk ˌɑːf.tər/", exEn: "She takes after her mother.", exRu: "Она похожа на свою мать.", cefr: "B1" },
      { en: "bring up", pos: "phrasal verb", ru: ["воспитывать"], ipa: "/ˌbrɪŋ ˈʌp/", exEn: "My grandparents brought me up.", exRu: "Меня воспитали бабушка с дедушкой.", cefr: "B1" },
      { en: "like father, like son", pos: "idiom", ru: ["яблоко от яблони недалеко падает"], ipa: "/ˌlaɪk ˈfɑː.ðə ˌlaɪk ˈsʌn/", exEn: "He works as hard as his dad — like father, like son.", exRu: "Он работает так же усердно, как отец — яблоко от яблони.", cefr: "B1" },
      { en: "run in the family", pos: "idiom", ru: ["быть семейной чертой"], ipa: "/ˌrʌn ɪn ðə ˈfæm.əl.i/", exEn: "Musical talent runs in the family.", exRu: "Музыкальный талант — это у них семейное.", cefr: "B2" },
    ],
  },

  // ─── Дом ────────────────────────────────────────────────────────
  {
    theme: "home",
    title: "Дом",
    emoji: "🏠",
    description: "Комнаты, мебель и предметы дома.",
    words: [
      { en: "house", pos: "noun", ru: ["дом"], ipa: "/haʊs/", exEn: "They live in a big house.", exRu: "Они живут в большом доме.", cefr: "A1" },
      { en: "room", pos: "noun", ru: ["комната"], ipa: "/ruːm/", exEn: "My room is on the second floor.", exRu: "Моя комната на втором этаже.", cefr: "A1" },
      { en: "kitchen", pos: "noun", ru: ["кухня"], ipa: "/ˈkɪtʃ.ɪn/", exEn: "She is cooking in the kitchen.", exRu: "Она готовит на кухне.", cefr: "A1" },
      { en: "door", pos: "noun", ru: ["дверь"], ipa: "/dɔːr/", exEn: "Please close the door.", exRu: "Пожалуйста, закрой дверь.", cefr: "A1" },
      { en: "window", pos: "noun", ru: ["окно"], ipa: "/ˈwɪn.dəʊ/", exEn: "Open the window for fresh air.", exRu: "Открой окно, чтобы проветрить.", cefr: "A1" },
      { en: "table", pos: "noun", ru: ["стол"], ipa: "/ˈteɪ.bəl/", exEn: "Dinner is on the table.", exRu: "Ужин на столе.", cefr: "A1" },
      { en: "chair", pos: "noun", ru: ["стул"], ipa: "/tʃeər/", exEn: "Please sit on this chair.", exRu: "Пожалуйста, сядь на этот стул.", cefr: "A1" },
      { en: "bed", pos: "noun", ru: ["кровать"], ipa: "/bed/", exEn: "The cat is sleeping on the bed.", exRu: "Кошка спит на кровати.", cefr: "A1" },
      { en: "floor", pos: "noun", ru: ["пол", "этаж"], ipa: "/flɔːr/", exEn: "The children sat on the floor.", exRu: "Дети сели на пол.", cefr: "A1" },
      { en: "wall", pos: "noun", ru: ["стена"], ipa: "/wɔːl/", exEn: "There is a picture on the wall.", exRu: "На стене висит картина.", cefr: "A1" },
      { en: "furniture", pos: "noun", ru: ["мебель"], ipa: "/ˈfɜː.nɪ.tʃər/", exEn: "We bought new furniture for the flat.", exRu: "Мы купили новую мебель для квартиры.", cefr: "A2" },
      { en: "garden", pos: "noun", ru: ["сад"], ipa: "/ˈɡɑː.dən/", exEn: "They grow roses in the garden.", exRu: "Они выращивают розы в саду.", cefr: "A1" },
      { en: "clean", pos: "verb", ru: ["убирать", "чистить"], ipa: "/kliːn/", exEn: "I clean my room on Saturdays.", exRu: "Я убираю комнату по субботам.", cefr: "A1" },
      { en: "comfortable", pos: "adjective", ru: ["удобный", "уютный"], ipa: "/ˈkʌmf.tə.bəl/", exEn: "This sofa is very comfortable.", exRu: "Этот диван очень удобный.", cefr: "A2" },
      // словосочетания и фразеологизмы
      { en: "at home", pos: "collocation", ru: ["дома"], ipa: "/ət ˈhəʊm/", exEn: "I stayed at home all day.", exRu: "Я весь день был дома.", cefr: "A1" },
      { en: "do the washing-up", pos: "collocation", ru: ["мыть посуду"], ipa: "/ˌduː ðə ˈwɒʃ.ɪŋ ʌp/", exEn: "Whose turn is it to do the washing-up?", exRu: "Чья очередь мыть посуду?", cefr: "A2" },
      { en: "tidy up", pos: "phrasal verb", ru: ["убираться", "приводить в порядок"], ipa: "/ˌtaɪ.di ˈʌp/", exEn: "Please tidy up your room.", exRu: "Пожалуйста, убери свою комнату.", cefr: "A2" },
      { en: "make yourself at home", pos: "idiom", ru: ["будь как дома"], ipa: "/ˌmeɪk jɔːˈself ət ˈhəʊm/", exEn: "Come in and make yourself at home.", exRu: "Заходи и будь как дома.", cefr: "B1" },
      { en: "there's no place like home", pos: "idiom", ru: ["в гостях хорошо, а дома лучше"], ipa: "/ðeəz ˌnəʊ ˌpleɪs laɪk ˈhəʊm/", exEn: "After a long trip I always think there's no place like home.", exRu: "После долгой поездки я всегда думаю: в гостях хорошо, а дома лучше.", cefr: "B1" },
    ],
  },

  // ─── Тело и здоровье ────────────────────────────────────────────
  {
    theme: "body_health",
    title: "Тело и здоровье",
    emoji: "🩺",
    description: "Части тела, здоровье и самочувствие.",
    words: [
      { en: "head", pos: "noun", ru: ["голова"], ipa: "/hed/", exEn: "My head hurts a little.", exRu: "У меня немного болит голова.", cefr: "A1" },
      { en: "hand", pos: "noun", ru: ["рука", "кисть"], ipa: "/hænd/", exEn: "Wash your hands before eating.", exRu: "Помой руки перед едой.", cefr: "A1" },
      { en: "eye", pos: "noun", ru: ["глаз"], ipa: "/aɪ/", exEn: "She has beautiful blue eyes.", exRu: "У неё красивые голубые глаза.", cefr: "A1" },
      { en: "heart", pos: "noun", ru: ["сердце"], ipa: "/hɑːt/", exEn: "Exercise is good for your heart.", exRu: "Спорт полезен для сердца.", cefr: "A2" },
      { en: "leg", pos: "noun", ru: ["нога"], ipa: "/leɡ/", exEn: "He broke his leg while skiing.", exRu: "Он сломал ногу, катаясь на лыжах.", cefr: "A1" },
      { en: "tooth", pos: "noun", ru: ["зуб"], ipa: "/tuːθ/", exEn: "Brush your teeth twice a day.", exRu: "Чисти зубы дважды в день.", cefr: "A1" },
      { en: "healthy", pos: "adjective", ru: ["здоровый"], ipa: "/ˈhel.θi/", exEn: "She eats healthy food.", exRu: "Она ест здоровую пищу.", cefr: "A2" },
      { en: "sick", pos: "adjective", ru: ["больной"], ipa: "/sɪk/", exEn: "I feel sick today.", exRu: "Я сегодня плохо себя чувствую.", cefr: "A1" },
      { en: "doctor", pos: "noun", ru: ["врач", "доктор"], ipa: "/ˈdɒk.tər/", exEn: "You should see a doctor.", exRu: "Тебе стоит сходить к врачу.", cefr: "A1" },
      { en: "medicine", pos: "noun", ru: ["лекарство", "медицина"], ipa: "/ˈmed.ɪ.sən/", exEn: "Take this medicine after meals.", exRu: "Принимай это лекарство после еды.", cefr: "A2" },
      { en: "pain", pos: "noun", ru: ["боль"], ipa: "/peɪn/", exEn: "She felt a sharp pain in her back.", exRu: "Она почувствовала резкую боль в спине.", cefr: "B1" },
      { en: "tired", pos: "adjective", ru: ["уставший"], ipa: "/ˈtaɪəd/", exEn: "I'm too tired to go out.", exRu: "Я слишком устал, чтобы куда-то идти.", cefr: "A1" },
      { en: "sleep", pos: "verb", ru: ["спать"], ipa: "/sliːp/", exEn: "Babies sleep a lot.", exRu: "Малыши много спят.", cefr: "A1" },
      { en: "recover", pos: "verb", ru: ["выздоравливать", "восстанавливаться"], ipa: "/rɪˈkʌv.ər/", exEn: "It took a week to recover from the flu.", exRu: "На восстановление после гриппа ушла неделя.", cefr: "B2" },
      // словосочетания и фразеологизмы
      { en: "have a headache", pos: "collocation", ru: ["болит голова"], ipa: "/ˌhæv ə ˈhed.eɪk/", exEn: "I have a headache, I need to rest.", exRu: "У меня болит голова, мне нужно отдохнуть.", cefr: "A1" },
      { en: "catch a cold", pos: "collocation", ru: ["простудиться"], ipa: "/ˌkætʃ ə ˈkəʊld/", exEn: "Wear a hat or you'll catch a cold.", exRu: "Надень шапку, иначе простудишься.", cefr: "A2" },
      { en: "get better", pos: "phrasal verb", ru: ["выздоравливать", "становиться лучше"], ipa: "/ˌɡet ˈbet.ər/", exEn: "I hope you get better soon.", exRu: "Надеюсь, ты скоро выздоровеешь.", cefr: "A2" },
      { en: "be in good shape", pos: "idiom", ru: ["быть в хорошей форме"], ipa: "/bi ɪn ˌɡʊd ˈʃeɪp/", exEn: "He runs every day, so he's in good shape.", exRu: "Он бегает каждый день, поэтому он в хорошей форме.", cefr: "B1" },
      { en: "feel under the weather", pos: "idiom", ru: ["чувствовать себя нездорово"], ipa: "/ˌfiːl ˌʌn.də ðə ˈweð.ər/", exEn: "She stayed home because she felt under the weather.", exRu: "Она осталась дома, потому что чувствовала себя нездорово.", cefr: "B2" },
    ],
  },

  // ─── Работа и карьера ───────────────────────────────────────────
  {
    theme: "work",
    title: "Работа и карьера",
    emoji: "💼",
    description: "Профессии, офис и рабочие процессы.",
    words: [
      { en: "job", pos: "noun", ru: ["работа", "должность"], ipa: "/dʒɒb/", exEn: "She found a new job.", exRu: "Она нашла новую работу.", cefr: "A1" },
      { en: "office", pos: "noun", ru: ["офис"], ipa: "/ˈɒf.ɪs/", exEn: "Our office is in the city centre.", exRu: "Наш офис в центре города.", cefr: "A1" },
      { en: "manager", pos: "noun", ru: ["менеджер", "руководитель"], ipa: "/ˈmæn.ɪ.dʒər/", exEn: "The manager is in a meeting.", exRu: "Руководитель на совещании.", cefr: "A2" },
      { en: "colleague", pos: "noun", ru: ["коллега"], ipa: "/ˈkɒl.iːɡ/", exEn: "My colleagues are very friendly.", exRu: "Мои коллеги очень дружелюбные.", cefr: "B1" },
      { en: "salary", pos: "noun", ru: ["зарплата"], ipa: "/ˈsæl.ər.i/", exEn: "He earns a good salary.", exRu: "Он получает хорошую зарплату.", cefr: "B1" },
      { en: "meeting", pos: "noun", ru: ["встреча", "совещание"], ipa: "/ˈmiː.tɪŋ/", exEn: "The meeting starts at ten.", exRu: "Совещание начинается в десять.", cefr: "A2" },
      { en: "deadline", pos: "noun", ru: ["срок", "дедлайн"], ipa: "/ˈded.laɪn/", exEn: "We must meet the deadline.", exRu: "Мы должны уложиться в срок.", cefr: "B1" },
      { en: "employee", pos: "noun", ru: ["сотрудник", "работник"], ipa: "/ɪmˈplɔɪ.iː/", exEn: "The company has 200 employees.", exRu: "В компании 200 сотрудников.", cefr: "B1" },
      { en: "experience", pos: "noun", ru: ["опыт"], ipa: "/ɪkˈspɪə.ri.əns/", exEn: "She has ten years of experience.", exRu: "У неё десять лет опыта.", cefr: "A2" },
      { en: "skill", pos: "noun", ru: ["навык", "умение"], ipa: "/skɪl/", exEn: "Communication is an important skill.", exRu: "Общение — важный навык.", cefr: "A2" },
      { en: "hire", pos: "verb", ru: ["нанимать"], ipa: "/haɪər/", exEn: "They decided to hire her.", exRu: "Они решили её нанять.", cefr: "B1" },
      { en: "career", pos: "noun", ru: ["карьера"], ipa: "/kəˈrɪər/", exEn: "He is building a career in law.", exRu: "Он строит карьеру в юриспруденции.", cefr: "B1" },
      { en: "interview", pos: "noun", ru: ["собеседование", "интервью"], ipa: "/ˈɪn.tə.vjuː/", exEn: "I have a job interview tomorrow.", exRu: "У меня завтра собеседование.", cefr: "A2" },
      { en: "achieve", pos: "verb", ru: ["достигать"], ipa: "/əˈtʃiːv/", exEn: "You can achieve your goals with effort.", exRu: "Ты можешь достичь целей усилиями.", cefr: "B2" },
      // словосочетания и фразеологизмы
      { en: "full-time job", pos: "collocation", ru: ["работа на полную ставку"], ipa: "/ˌfʊl taɪm ˈdʒɒb/", exEn: "She found a full-time job in a bank.", exRu: "Она нашла работу на полную ставку в банке.", cefr: "A2" },
      { en: "apply for a job", pos: "collocation", ru: ["подавать заявку на работу"], ipa: "/əˌplaɪ fər ə ˈdʒɒb/", exEn: "I applied for a job at the school.", exRu: "Я подал заявку на работу в школе.", cefr: "B1" },
      { en: "work overtime", pos: "collocation", ru: ["работать сверхурочно"], ipa: "/ˌwɜːk ˈəʊ.və.taɪm/", exEn: "He works overtime every Friday.", exRu: "Он работает сверхурочно каждую пятницу.", cefr: "B1" },
      { en: "get down to business", pos: "idiom", ru: ["перейти к делу"], ipa: "/ˌɡet ˌdaʊn tə ˈbɪz.nɪs/", exEn: "Let's get down to business and open the report.", exRu: "Давайте перейдём к делу и откроем отчёт.", cefr: "B2" },
      { en: "climb the career ladder", pos: "idiom", ru: ["продвигаться по карьерной лестнице"], ipa: "/ˌklaɪm ðə kəˈrɪə ˌlæd.ər/", exEn: "She climbed the career ladder in five years.", exRu: "Она поднялась по карьерной лестнице за пять лет.", cefr: "B2" },
    ],
  },

  // ─── Природа ────────────────────────────────────────────────────
  {
    theme: "nature",
    title: "Природа",
    emoji: "🌿",
    description: "Природа, погода и окружающий мир.",
    words: [
      { en: "tree", pos: "noun", ru: ["дерево"], ipa: "/triː/", exEn: "There is a tall tree in the park.", exRu: "В парке растёт высокое дерево.", cefr: "A1" },
      { en: "flower", pos: "noun", ru: ["цветок"], ipa: "/flaʊər/", exEn: "She picked a flower for her mother.", exRu: "Она сорвала цветок для мамы.", cefr: "A1" },
      { en: "river", pos: "noun", ru: ["река"], ipa: "/ˈrɪv.ər/", exEn: "The river flows into the sea.", exRu: "Река впадает в море.", cefr: "A1" },
      { en: "mountain", pos: "noun", ru: ["гора"], ipa: "/ˈmaʊn.tɪn/", exEn: "They climbed a high mountain.", exRu: "Они поднялись на высокую гору.", cefr: "A2" },
      { en: "sea", pos: "noun", ru: ["море"], ipa: "/siː/", exEn: "The sea is calm today.", exRu: "Море сегодня спокойное.", cefr: "A1" },
      { en: "sky", pos: "noun", ru: ["небо"], ipa: "/skaɪ/", exEn: "The sky is clear and blue.", exRu: "Небо чистое и голубое.", cefr: "A1" },
      { en: "sun", pos: "noun", ru: ["солнце"], ipa: "/sʌn/", exEn: "The sun rises in the east.", exRu: "Солнце встаёт на востоке.", cefr: "A1" },
      { en: "rain", pos: "noun", ru: ["дождь"], ipa: "/reɪn/", exEn: "We stayed home because of the rain.", exRu: "Мы остались дома из-за дождя.", cefr: "A1" },
      { en: "snow", pos: "noun", ru: ["снег"], ipa: "/snəʊ/", exEn: "Children love playing in the snow.", exRu: "Дети любят играть в снегу.", cefr: "A1" },
      { en: "wind", pos: "noun", ru: ["ветер"], ipa: "/wɪnd/", exEn: "A cold wind is blowing.", exRu: "Дует холодный ветер.", cefr: "A2" },
      { en: "forest", pos: "noun", ru: ["лес"], ipa: "/ˈfɒr.ɪst/", exEn: "We walked through the forest.", exRu: "Мы шли через лес.", cefr: "A2" },
      { en: "weather", pos: "noun", ru: ["погода"], ipa: "/ˈweð.ər/", exEn: "What is the weather like today?", exRu: "Какая сегодня погода?", cefr: "A1" },
      { en: "environment", pos: "noun", ru: ["окружающая среда"], ipa: "/ɪnˈvaɪ.rən.mənt/", exEn: "We must protect the environment.", exRu: "Мы должны защищать окружающую среду.", cefr: "B1" },
      { en: "beautiful", pos: "adjective", ru: ["красивый"], ipa: "/ˈbjuː.tɪ.fəl/", exEn: "What a beautiful sunset!", exRu: "Какой красивый закат!", cefr: "A1" },
      // словосочетания и фразеологизмы
      { en: "fresh air", pos: "collocation", ru: ["свежий воздух"], ipa: "/ˌfreʃ ˈeər/", exEn: "Let's go outside for some fresh air.", exRu: "Давай выйдем на свежий воздух.", cefr: "A1" },
      { en: "go for a walk", pos: "collocation", ru: ["идти на прогулку"], ipa: "/ˌɡəʊ fər ə ˈwɔːk/", exEn: "We go for a walk in the park every evening.", exRu: "Мы гуляем в парке каждый вечер.", cefr: "A1" },
      { en: "climate change", pos: "collocation", ru: ["изменение климата"], ipa: "/ˈklaɪ.mət ˌtʃeɪndʒ/", exEn: "Climate change affects the whole planet.", exRu: "Изменение климата влияет на всю планету.", cefr: "B1" },
      { en: "once in a blue moon", pos: "idiom", ru: ["очень редко", "раз в сто лет"], ipa: "/ˌwʌns ɪn ə ˌbluː ˈmuːn/", exEn: "We see snow here once in a blue moon.", exRu: "Снег здесь бывает очень редко.", cefr: "B2" },
      { en: "the calm before the storm", pos: "idiom", ru: ["затишье перед бурей"], ipa: "/ðə ˌkɑːm bɪˌfɔː ðə ˈstɔːm/", exEn: "The quiet office was the calm before the storm.", exRu: "Тихий офис был затишьем перед бурей.", cefr: "B2" },
    ],
  },

  // ─── Технологии ─────────────────────────────────────────────────
  {
    theme: "technology",
    title: "Технологии",
    emoji: "💻",
    description: "Компьютеры, интернет и гаджеты.",
    words: [
      { en: "computer", pos: "noun", ru: ["компьютер"], ipa: "/kəmˈpjuː.tər/", exEn: "I work on my computer all day.", exRu: "Я весь день работаю за компьютером.", cefr: "A1" },
      { en: "phone", pos: "noun", ru: ["телефон"], ipa: "/fəʊn/", exEn: "My phone battery is low.", exRu: "У моего телефона садится батарея.", cefr: "A1" },
      { en: "internet", pos: "noun", ru: ["интернет"], ipa: "/ˈɪn.tə.net/", exEn: "The internet is very slow today.", exRu: "Интернет сегодня очень медленный.", cefr: "A2" },
      { en: "screen", pos: "noun", ru: ["экран"], ipa: "/skriːn/", exEn: "Don't sit too close to the screen.", exRu: "Не сиди слишком близко к экрану.", cefr: "A2" },
      { en: "keyboard", pos: "noun", ru: ["клавиатура"], ipa: "/ˈkiː.bɔːd/", exEn: "This keyboard is very quiet.", exRu: "Эта клавиатура очень тихая.", cefr: "A2" },
      { en: "message", pos: "noun", ru: ["сообщение"], ipa: "/ˈmes.ɪdʒ/", exEn: "I sent you a message.", exRu: "Я отправил тебе сообщение.", cefr: "A1" },
      { en: "download", pos: "verb", ru: ["скачивать", "загружать"], ipa: "/ˌdaʊnˈləʊd/", exEn: "You can download the app for free.", exRu: "Ты можешь скачать приложение бесплатно.", cefr: "A2" },
      { en: "software", pos: "noun", ru: ["программное обеспечение"], ipa: "/ˈsɒft.weər/", exEn: "The company makes accounting software.", exRu: "Компания делает бухгалтерское ПО.", cefr: "B1" },
      { en: "password", pos: "noun", ru: ["пароль"], ipa: "/ˈpɑːs.wɜːd/", exEn: "I forgot my password again.", exRu: "Я снова забыл пароль.", cefr: "A2" },
      { en: "device", pos: "noun", ru: ["устройство"], ipa: "/dɪˈvaɪs/", exEn: "This app works on any device.", exRu: "Это приложение работает на любом устройстве.", cefr: "B1" },
      { en: "update", pos: "verb", ru: ["обновлять"], ipa: "/ˌʌpˈdeɪt/", exEn: "Please update the application.", exRu: "Пожалуйста, обнови приложение.", cefr: "B1" },
      { en: "network", pos: "noun", ru: ["сеть"], ipa: "/ˈnet.wɜːk/", exEn: "The office network is down.", exRu: "Офисная сеть не работает.", cefr: "B1" },
      { en: "data", pos: "noun", ru: ["данные"], ipa: "/ˈdeɪ.tə/", exEn: "The app collects too much data.", exRu: "Приложение собирает слишком много данных.", cefr: "B1" },
      { en: "smart", pos: "adjective", ru: ["умный", "смарт-"], ipa: "/smɑːt/", exEn: "She bought a new smart watch.", exRu: "Она купила новые умные часы.", cefr: "A2" },
      // словосочетания и фразеологизмы
      { en: "log in", pos: "phrasal verb", ru: ["входить в аккаунт"], ipa: "/ˌlɒɡ ˈɪn/", exEn: "Log in with your username and password.", exRu: "Войди, используя логин и пароль.", cefr: "A2" },
      { en: "social media", pos: "collocation", ru: ["социальные сети"], ipa: "/ˌsəʊ.ʃəl ˈmiː.di.ə/", exEn: "She posts her photos on social media.", exRu: "Она публикует свои фото в социальных сетях.", cefr: "A2" },
      { en: "charge the battery", pos: "collocation", ru: ["заряжать батарею"], ipa: "/ˌtʃɑːdʒ ðə ˈbæt.ər.i/", exEn: "I need to charge the battery before the trip.", exRu: "Мне нужно зарядить батарею перед поездкой.", cefr: "A2" },
      { en: "back up", pos: "phrasal verb", ru: ["делать резервную копию"], ipa: "/ˌbæk ˈʌp/", exEn: "Always back up your files.", exRu: "Всегда делай резервную копию файлов.", cefr: "B1" },
      { en: "cutting-edge technology", pos: "collocation", ru: ["передовая технология"], ipa: "/ˌkʌt.ɪŋ edʒ tekˈnɒl.ə.dʒi/", exEn: "The lab uses cutting-edge technology.", exRu: "Лаборатория использует передовые технологии.", cefr: "C1" },
    ],
  },

  // ─── Путешествия ────────────────────────────────────────────────
  {
    theme: "travel",
    title: "Путешествия",
    emoji: "✈️",
    description: "Поездки, отпуск и туризм.",
    words: [
      { en: "trip", pos: "noun", ru: ["поездка"], ipa: "/trɪp/", exEn: "We are planning a trip to Italy.", exRu: "Мы планируем поездку в Италию.", cefr: "A1" },
      { en: "hotel", pos: "noun", ru: ["гостиница", "отель"], ipa: "/həʊˈtel/", exEn: "The hotel is near the beach.", exRu: "Отель рядом с пляжем.", cefr: "A1" },
      { en: "map", pos: "noun", ru: ["карта"], ipa: "/mæp/", exEn: "Let's look at the map.", exRu: "Давай посмотрим на карту.", cefr: "A1" },
      { en: "luggage", pos: "noun", ru: ["багаж"], ipa: "/ˈlʌɡ.ɪdʒ/", exEn: "My luggage is very heavy.", exRu: "Мой багаж очень тяжёлый.", cefr: "A2" },
      { en: "passport", pos: "noun", ru: ["паспорт"], ipa: "/ˈpɑːs.pɔːt/", exEn: "Don't forget your passport.", exRu: "Не забудь паспорт.", cefr: "A2" },
      { en: "beach", pos: "noun", ru: ["пляж"], ipa: "/biːtʃ/", exEn: "We spent the day at the beach.", exRu: "Мы провели день на пляже.", cefr: "A1" },
      { en: "abroad", pos: "adverb", ru: ["за границей", "за границу"], ipa: "/əˈbrɔːd/", exEn: "She often travels abroad.", exRu: "Она часто путешествует за границу.", cefr: "B1" },
      { en: "tourist", pos: "noun", ru: ["турист"], ipa: "/ˈtʊə.rɪst/", exEn: "The city is full of tourists.", exRu: "Город полон туристов.", cefr: "A2" },
      { en: "vacation", pos: "noun", ru: ["отпуск", "каникулы"], ipa: "/veɪˈkeɪ.ʃən/", exEn: "We are on vacation next week.", exRu: "На следующей неделе у нас отпуск.", cefr: "A2" },
      { en: "book", pos: "verb", ru: ["бронировать"], ipa: "/bʊk/", exEn: "I booked a room for two nights.", exRu: "Я забронировал номер на две ночи.", cefr: "A2" },
      { en: "destination", pos: "noun", ru: ["пункт назначения"], ipa: "/ˌdes.tɪˈneɪ.ʃən/", exEn: "Paris is a popular destination.", exRu: "Париж — популярное направление.", cefr: "B1" },
      { en: "explore", pos: "verb", ru: ["исследовать", "изучать"], ipa: "/ɪkˈsplɔːr/", exEn: "We love to explore new places.", exRu: "Мы любим исследовать новые места.", cefr: "B1" },
      { en: "adventure", pos: "noun", ru: ["приключение"], ipa: "/ədˈven.tʃər/", exEn: "The trip was a real adventure.", exRu: "Поездка стала настоящим приключением.", cefr: "B1" },
      // словосочетания и фразеологизмы
      { en: "go abroad", pos: "collocation", ru: ["ехать за границу"], ipa: "/ˌɡəʊ əˈbrɔːd/", exEn: "They go abroad every summer.", exRu: "Они каждое лето едут за границу.", cefr: "A2" },
      { en: "check in", pos: "phrasal verb", ru: ["регистрироваться в отеле или аэропорту"], ipa: "/ˌtʃek ˈɪn/", exEn: "We checked in at the hotel at noon.", exRu: "Мы зарегистрировались в отеле в полдень.", cefr: "A2" },
      { en: "book a ticket", pos: "collocation", ru: ["бронировать билет"], ipa: "/ˌbʊk ə ˈtɪk.ɪt/", exEn: "I booked a ticket to Rome online.", exRu: "Я забронировал билет в Рим онлайн.", cefr: "A2" },
      { en: "travel light", pos: "idiom", ru: ["путешествовать без лишнего багажа"], ipa: "/ˌtræv.əl ˈlaɪt/", exEn: "I always travel light — just one bag.", exRu: "Я всегда путешествую налегке — только одна сумка.", cefr: "B1" },
      { en: "off the beaten track", pos: "idiom", ru: ["в стороне от туристических маршрутов"], ipa: "/ˌɒf ðə ˌbiː.tən ˈtræk/", exEn: "The village is off the beaten track.", exRu: "Деревня расположена в стороне от туристических маршрутов.", cefr: "B2" },
    ],
  },

  // ─── Неправильные глаголы ───────────────────────────────────────
  {
    theme: "irregular_verbs",
    title: "Неправильные глаголы",
    emoji: "🔤",
    description: "Частые неправильные глаголы (пример — форма прошедшего времени).",
    words: [
      { en: "go", pos: "verb", ru: ["идти", "ехать"], ipa: "/ɡəʊ/", exEn: "Yesterday I went to the cinema.", exRu: "Вчера я ходил в кино. (go — went — gone)", cefr: "A1" },
      { en: "make", pos: "verb", ru: ["делать", "создавать"], ipa: "/meɪk/", exEn: "She made a cake for the party.", exRu: "Она сделала торт на праздник. (make — made — made)", cefr: "A1" },
      { en: "take", pos: "verb", ru: ["брать", "взять"], ipa: "/teɪk/", exEn: "He took my umbrella by mistake.", exRu: "Он по ошибке взял мой зонт. (take — took — taken)", cefr: "A1" },
      { en: "see", pos: "verb", ru: ["видеть"], ipa: "/siː/", exEn: "I saw an old friend today.", exRu: "Сегодня я увидел старого друга. (see — saw — seen)", cefr: "A1" },
      { en: "come", pos: "verb", ru: ["приходить", "приезжать"], ipa: "/kʌm/", exEn: "They came home very late.", exRu: "Они пришли домой очень поздно. (come — came — come)", cefr: "A1" },
      { en: "give", pos: "verb", ru: ["давать", "дарить"], ipa: "/ɡɪv/", exEn: "She gave me a present.", exRu: "Она подарила мне подарок. (give — gave — given)", cefr: "A1" },
      { en: "know", pos: "verb", ru: ["знать"], ipa: "/nəʊ/", exEn: "I knew the answer at once.", exRu: "Я сразу знал ответ. (know — knew — known)", cefr: "A1" },
      { en: "think", pos: "verb", ru: ["думать"], ipa: "/θɪŋk/", exEn: "I thought about it all night.", exRu: "Я думал об этом всю ночь. (think — thought — thought)", cefr: "A2" },
      { en: "buy", pos: "verb", ru: ["покупать"], ipa: "/baɪ/", exEn: "We bought a new car last year.", exRu: "Мы купили новую машину в прошлом году. (buy — bought — bought)", cefr: "A1" },
      { en: "bring", pos: "verb", ru: ["приносить"], ipa: "/brɪŋ/", exEn: "He brought flowers to the dinner.", exRu: "Он принёс цветы на ужин. (bring — brought — brought)", cefr: "A2" },
      { en: "write", pos: "verb", ru: ["писать"], ipa: "/raɪt/", exEn: "She wrote a letter to her friend.", exRu: "Она написала письмо подруге. (write — wrote — written)", cefr: "A1" },
      { en: "speak", pos: "verb", ru: ["говорить"], ipa: "/spiːk/", exEn: "He spoke to the manager yesterday.", exRu: "Он вчера говорил с руководителем. (speak — spoke — spoken)", cefr: "A2" },
      { en: "find", pos: "verb", ru: ["находить"], ipa: "/faɪnd/", exEn: "I found my keys under the sofa.", exRu: "Я нашёл ключи под диваном. (find — found — found)", cefr: "A2" },
      { en: "become", pos: "verb", ru: ["становиться"], ipa: "/bɪˈkʌm/", exEn: "She became a famous writer.", exRu: "Она стала известной писательницей. (become — became — become)", cefr: "B1" },
      // фразеологизмы на основе неправильных глаголов
      { en: "take part in", pos: "collocation", ru: ["принимать участие в"], ipa: "/ˌteɪk ˈpɑːt ɪn/", exEn: "She took part in the competition.", exRu: "Она приняла участие в соревновании. (take — took — taken)", cefr: "A2" },
      { en: "break the ice", pos: "idiom", ru: ["растопить лёд", "разрядить обстановку"], ipa: "/ˌbreɪk ði ˈaɪs/", exEn: "A joke helped to break the ice.", exRu: "Шутка помогла разрядить обстановку. (break — broke — broken)", cefr: "B1" },
      { en: "make up your mind", pos: "idiom", ru: ["решиться", "принять решение"], ipa: "/ˌmeɪk ʌp jɔː ˈmaɪnd/", exEn: "Make up your mind: tea or coffee?", exRu: "Реши уже: чай или кофе? (make — made — made)", cefr: "B1" },
      { en: "get over", pos: "phrasal verb", ru: ["преодолеть", "справиться"], ipa: "/ˌɡet ˈəʊ.vər/", exEn: "It took him a month to get over the illness.", exRu: "Ему потребовался месяц, чтобы справиться с болезнью. (get — got — got)", cefr: "B1" },
      { en: "lose track of time", pos: "idiom", ru: ["потерять счёт времени"], ipa: "/ˌluːz ˌtræk əv ˈtaɪm/", exEn: "I was reading and lost track of time.", exRu: "Я читал и потерял счёт времени. (lose — lost — lost)", cefr: "B2" },
    ],
  },

  // ─── Топ базовых слов (A1) ──────────────────────────────────────
  {
    theme: "top_a1",
    title: "Топ слов и фраз A1",
    emoji: "⭐",
    description: "Самые частые слова для начинающих и базовые речевые формулы.",
    cefrLevel: "A1",
    words: [
      { en: "time", pos: "noun", ru: ["время"], ipa: "/taɪm/", exEn: "What time is it?", exRu: "Который час?", cefr: "A1" },
      { en: "people", pos: "noun", ru: ["люди"], ipa: "/ˈpiː.pəl/", exEn: "Many people came to the party.", exRu: "На вечеринку пришло много людей.", cefr: "A1" },
      { en: "day", pos: "noun", ru: ["день"], ipa: "/deɪ/", exEn: "Have a nice day!", exRu: "Хорошего дня!", cefr: "A1" },
      { en: "good", pos: "adjective", ru: ["хороший"], ipa: "/ɡʊd/", exEn: "This is a good idea.", exRu: "Это хорошая идея.", cefr: "A1" },
      { en: "new", pos: "adjective", ru: ["новый"], ipa: "/njuː/", exEn: "I bought a new phone.", exRu: "Я купил новый телефон.", cefr: "A1" },
      { en: "big", pos: "adjective", ru: ["большой"], ipa: "/bɪɡ/", exEn: "They live in a big city.", exRu: "Они живут в большом городе.", cefr: "A1" },
      { en: "small", pos: "adjective", ru: ["маленький"], ipa: "/smɔːl/", exEn: "She has a small dog.", exRu: "У неё маленькая собака.", cefr: "A1" },
      { en: "want", pos: "verb", ru: ["хотеть"], ipa: "/wɒnt/", exEn: "I want a cup of tea.", exRu: "Я хочу чашку чая.", cefr: "A1" },
      { en: "work", pos: "verb", ru: ["работать"], ipa: "/wɜːk/", exEn: "I work in a hospital.", exRu: "Я работаю в больнице.", cefr: "A1" },
      { en: "learn", pos: "verb", ru: ["учить", "учиться"], ipa: "/lɜːn/", exEn: "I want to learn English.", exRu: "Я хочу выучить английский.", cefr: "A1" },
      { en: "help", pos: "verb", ru: ["помогать"], ipa: "/help/", exEn: "Can you help me, please?", exRu: "Можешь мне помочь, пожалуйста?", cefr: "A1" },
      { en: "friend", pos: "noun", ru: ["друг", "подруга"], ipa: "/frend/", exEn: "He is my best friend.", exRu: "Он мой лучший друг.", cefr: "A1" },
      { en: "happy", pos: "adjective", ru: ["счастливый", "радостный"], ipa: "/ˈhæp.i/", exEn: "I'm happy to see you.", exRu: "Я рад тебя видеть.", cefr: "A1" },
      { en: "money", pos: "noun", ru: ["деньги"], ipa: "/ˈmʌn.i/", exEn: "I don't have much money.", exRu: "У меня не так много денег.", cefr: "A1" },
      { en: "school", pos: "noun", ru: ["школа"], ipa: "/skuːl/", exEn: "The children go to school by bus.", exRu: "Дети ездят в школу на автобусе.", cefr: "A1" },
      { en: "city", pos: "noun", ru: ["город"], ipa: "/ˈsɪt.i/", exEn: "London is a big city.", exRu: "Лондон — большой город.", cefr: "A1" },
      // базовые речевые формулы
      { en: "good morning", pos: "phrase", ru: ["доброе утро"], ipa: "/ˌɡʊd ˈmɔː.nɪŋ/", exEn: "Good morning! How are you today?", exRu: "Доброе утро! Как ты сегодня?", cefr: "A1" },
      { en: "thank you very much", pos: "phrase", ru: ["большое спасибо"], ipa: "/ˌθæŋk ju ˌver.i ˈmʌtʃ/", exEn: "Thank you very much for your help.", exRu: "Большое спасибо за помощь.", cefr: "A1" },
      { en: "excuse me", pos: "phrase", ru: ["извините", "простите"], ipa: "/ɪkˈskjuːz mi/", exEn: "Excuse me, where is the station?", exRu: "Извините, где находится вокзал?", cefr: "A1" },
      { en: "see you later", pos: "phrase", ru: ["до встречи", "увидимся"], ipa: "/ˌsiː ju ˈleɪ.tər/", exEn: "See you later, have a nice day!", exRu: "Увидимся, хорошего дня!", cefr: "A1" },
      { en: "you are welcome", pos: "phrase", ru: ["пожалуйста", "не за что"], ipa: "/juː ə ˈwel.kəm/", exEn: "— Thanks! — You are welcome.", exRu: "— Спасибо! — Не за что.", cefr: "A1" },
    ],
  },

  // ─── Первые фразы (A1) ─────────────────────────────
  {
    theme: "phrases_a1",
    title: "Первые фразы A1",
    emoji: "💬",
    description: "Речевые формулы для первых разговоров: знакомство, просьбы, урок.",
    cefrLevel: "A1",
    words: [
      { en: "how are you?", pos: "phrase", ru: ["как дела?", "как ты?"], ipa: "/ˌhaʊ ə ˈjuː/", exEn: "Hello, Tom! How are you?", exRu: "Привет, Том! Как дела?", cefr: "A1" },
      { en: "my name is", pos: "phrase", ru: ["меня зовут"], ipa: "/maɪ ˈneɪm ɪz/", exEn: "My name is Anna. What is your name?", exRu: "Меня зовут Анна. А тебя как зовут?", cefr: "A1" },
      { en: "nice to meet you", pos: "phrase", ru: ["приятно познакомиться"], ipa: "/ˌnaɪs tə ˈmiːt juː/", exEn: "Nice to meet you, Mr Brown.", exRu: "Приятно познакомиться, мистер Браун.", cefr: "A1" },
      { en: "I don't understand", pos: "phrase", ru: ["я не понимаю"], ipa: "/ˌaɪ ˌdəʊnt ˌʌn.dəˈstænd/", exEn: "Sorry, I don't understand. Can you repeat?", exRu: "Извините, я не понимаю. Можете повторить?", cefr: "A1" },
      { en: "can you help me?", pos: "phrase", ru: ["можешь мне помочь?"], ipa: "/ˌkæn ju ˈhelp mi/", exEn: "Excuse me, can you help me, please?", exRu: "Извините, можете мне помочь?", cefr: "A1" },
      { en: "how much is it?", pos: "phrase", ru: ["сколько это стоит?"], ipa: "/ˌhaʊ ˈmʌtʃ ɪz ɪt/", exEn: "I like this book. How much is it?", exRu: "Мне нравится эта книга. Сколько она стоит?", cefr: "A1" },
      { en: "I would like", pos: "phrase", ru: ["я бы хотел"], ipa: "/ˌaɪ wəd ˈlaɪk/", exEn: "I would like a cup of tea, please.", exRu: "Я бы хотел чашку чая, пожалуйста.", cefr: "A1" },
      { en: "what time is it?", pos: "phrase", ru: ["который час?"], ipa: "/ˌwɒt ˈtaɪm ɪz ɪt/", exEn: "What time is it? — It's five o'clock.", exRu: "Который час? — Пять часов.", cefr: "A1" },
      { en: "let's go", pos: "phrase", ru: ["пойдём", "давай пойдём"], ipa: "/ˌlets ˈɡəʊ/", exEn: "The bus is here — let's go!", exRu: "Автобус приехал — пойдём!", cefr: "A1" },
      { en: "sorry", pos: "interjection", ru: ["извини", "прости"], ipa: "/ˈsɒr.i/", exEn: "Sorry, I am late.", exRu: "Извини, я опоздал.", cefr: "A1" },
      { en: "please", pos: "adverb", ru: ["пожалуйста"], ipa: "/pliːz/", exEn: "Open the window, please.", exRu: "Открой окно, пожалуйста.", cefr: "A1" },
      { en: "goodbye", pos: "interjection", ru: ["до свидания"], ipa: "/ˌɡʊdˈbaɪ/", exEn: "Goodbye! See you tomorrow.", exRu: "До свидания! Увидимся завтра.", cefr: "A1" },
    ],
  },

  // ─── Топ слов и фраз (A2) ──────────────────────────
  {
    theme: "top_a2",
    title: "Топ слов и фраз A2",
    emoji: "⭐",
    description: "Самые частые слова уровня A2 вместе с базовыми словосочетаниями.",
    cefrLevel: "A2",
    words: [
      { en: "because", pos: "conjunction", ru: ["потому что"], ipa: "/bɪˈkɒz/", exEn: "I stayed home because it was raining.", exRu: "Я остался дома, потому что шёл дождь.", cefr: "A2" },
      { en: "important", pos: "adjective", ru: ["важный"], ipa: "/ɪmˈpɔː.tənt/", exEn: "This is an important question.", exRu: "Это важный вопрос.", cefr: "A2" },
      { en: "remember", pos: "verb", ru: ["помнить", "вспоминать"], ipa: "/rɪˈmem.bər/", exEn: "I remember your birthday.", exRu: "Я помню твой день рождения.", cefr: "A2" },
      { en: "decide", pos: "verb", ru: ["решать"], ipa: "/dɪˈsaɪd/", exEn: "We decided to go by train.", exRu: "Мы решили поехать на поезде.", cefr: "A2" },
      { en: "together", pos: "adverb", ru: ["вместе"], ipa: "/təˈɡeð.ər/", exEn: "Let's do the homework together.", exRu: "Давай сделаем домашку вместе.", cefr: "A2" },
      { en: "difficult", pos: "adjective", ru: ["трудный", "сложный"], ipa: "/ˈdɪf.ɪ.kəlt/", exEn: "The exam was difficult but fair.", exRu: "Экзамен был сложным, но честным.", cefr: "A2" },
      { en: "explain", pos: "verb", ru: ["объяснять"], ipa: "/ɪkˈspleɪn/", exEn: "Can you explain this rule again?", exRu: "Можешь объяснить это правило ещё раз?", cefr: "A2" },
      { en: "probably", pos: "adverb", ru: ["вероятно", "наверное"], ipa: "/ˈprɒb.əb.li/", exEn: "She will probably come later.", exRu: "Она, наверное, придёт позже.", cefr: "A2" },
      { en: "a lot of", pos: "collocation", ru: ["много"], ipa: "/ə ˈlɒt əv/", exEn: "There are a lot of books in the library.", exRu: "В библиотеке много книг.", cefr: "A2" },
      { en: "at the moment", pos: "collocation", ru: ["в данный момент", "сейчас"], ipa: "/ət ðə ˈməʊ.mənt/", exEn: "She is busy at the moment.", exRu: "Сейчас она занята.", cefr: "A2" },
      { en: "by the way", pos: "phrase", ru: ["кстати"], ipa: "/ˌbaɪ ðə ˈweɪ/", exEn: "By the way, your book is on my desk.", exRu: "Кстати, твоя книга у меня на столе.", cefr: "A2" },
      { en: "of course", pos: "phrase", ru: ["конечно"], ipa: "/əv ˈkɔːs/", exEn: "Of course I will help you.", exRu: "Конечно, я тебе помогу.", cefr: "A2" },
    ],
  },

  // ─── Повседневные фразы (A2) ───────────────────────
  {
    theme: "phrases_a2",
    title: "Повседневные фразы A2",
    emoji: "🗣️",
    description: "Фразовые глаголы и устойчивые выражения для повседневных ситуаций.",
    cefrLevel: "A2",
    words: [
      { en: "look for", pos: "phrasal verb", ru: ["искать"], ipa: "/ˈlʊk fɔːr/", exEn: "I am looking for my keys.", exRu: "Я ищу свои ключи.", cefr: "A2" },
      { en: "find out", pos: "phrasal verb", ru: ["выяснять", "узнавать"], ipa: "/ˌfaɪnd ˈaʊt/", exEn: "I want to find out the truth.", exRu: "Я хочу узнать правду.", cefr: "A2" },
      { en: "give up", pos: "phrasal verb", ru: ["сдаваться", "бросать"], ipa: "/ˌɡɪv ˈʌp/", exEn: "Don't give up — try again!", exRu: "Не сдавайся — попробуй ещё раз!", cefr: "A2" },
      { en: "take care of", pos: "collocation", ru: ["заботиться о"], ipa: "/ˌteɪk ˈkeər əv/", exEn: "She takes care of her little brother.", exRu: "Она заботится о младшем брате.", cefr: "A2" },
      { en: "be good at", pos: "collocation", ru: ["хорошо уметь", "быть способным в"], ipa: "/bi ˈɡʊd ət/", exEn: "He is good at maths.", exRu: "Он хорошо успевает по математике.", cefr: "A2" },
      { en: "make a mistake", pos: "collocation", ru: ["сделать ошибку"], ipa: "/ˌmeɪk ə mɪˈsteɪk/", exEn: "Everyone can make a mistake.", exRu: "Каждый может сделать ошибку.", cefr: "A2" },
      { en: "have fun", pos: "collocation", ru: ["весело провести время"], ipa: "/ˌhæv ˈfʌn/", exEn: "Have fun at the party!", exRu: "Весело проведи время на вечеринке!", cefr: "A2" },
      { en: "get up early", pos: "collocation", ru: ["вставать рано"], ipa: "/ˌɡet ʌp ˈɜː.li/", exEn: "I get up early on school days.", exRu: "В учебные дни я встаю рано.", cefr: "A2" },
      { en: "in my opinion", pos: "phrase", ru: ["по моему мнению"], ipa: "/ɪn maɪ əˈpɪn.jən/", exEn: "In my opinion, the film was boring.", exRu: "По моему мнению, фильм был скучным.", cefr: "A2" },
      { en: "no problem", pos: "phrase", ru: ["без проблем"], ipa: "/ˌnəʊ ˈprɒb.ləm/", exEn: "— Can you wait? — No problem.", exRu: "— Можешь подождать? — Без проблем.", cefr: "A2" },
      { en: "it depends", pos: "phrase", ru: ["это зависит", "смотря по обстоятельствам"], ipa: "/ɪt dɪˈpendz/", exEn: "— Will you come? — It depends on the weather.", exRu: "— Ты придёшь? — Зависит от погоды.", cefr: "A2" },
      { en: "as soon as possible", pos: "phrase", ru: ["как можно скорее"], ipa: "/əz ˌsuːn əz ˈpɒs.ə.bəl/", exEn: "Please answer as soon as possible.", exRu: "Пожалуйста, ответь как можно скорее.", cefr: "A2" },
    ],
  },

  // ─── Топ слов и фраз (B1) ──────────────────────────
  {
    theme: "top_b1",
    title: "Топ слов и фраз B1",
    emoji: "⭐",
    description: "Ключевая лексика уровня B1 и связки для развёрнутой речи.",
    cefrLevel: "B1",
    words: [
      { en: "although", pos: "conjunction", ru: ["хотя"], ipa: "/ɔːlˈðəʊ/", exEn: "Although it was cold, we went out.", exRu: "Хотя было холодно, мы вышли на улицу.", cefr: "B1" },
      { en: "improve", pos: "verb", ru: ["улучшать", "совершенствовать"], ipa: "/ɪmˈpruːv/", exEn: "Reading helps to improve your English.", exRu: "Чтение помогает улучшить английский.", cefr: "B1" },
      { en: "suggest", pos: "verb", ru: ["предлагать", "советовать"], ipa: "/səˈdʒest/", exEn: "I suggest starting with the easy tasks.", exRu: "Я предлагаю начать с простых заданий.", cefr: "B1" },
      { en: "opportunity", pos: "noun", ru: ["возможность"], ipa: "/ˌɒp.əˈtjuː.nə.ti/", exEn: "This is a great opportunity to learn.", exRu: "Это отличная возможность научиться.", cefr: "B1" },
      { en: "experience", pos: "noun", ru: ["опыт"], ipa: "/ɪkˈspɪə.ri.əns/", exEn: "She has five years of experience.", exRu: "У неё пять лет опыта.", cefr: "B1" },
      { en: "responsible", pos: "adjective", ru: ["ответственный"], ipa: "/rɪˈspɒn.sə.bəl/", exEn: "He is responsible for the project.", exRu: "Он отвечает за проект.", cefr: "B1" },
      { en: "develop", pos: "verb", ru: ["развивать", "разрабатывать"], ipa: "/dɪˈvel.əp/", exEn: "The school develops creative thinking.", exRu: "Школа развивает творческое мышление.", cefr: "B1" },
      { en: "avoid", pos: "verb", ru: ["избегать"], ipa: "/əˈvɔɪd/", exEn: "Try to avoid common mistakes.", exRu: "Старайся избегать типичных ошибок.", cefr: "B1" },
      { en: "attitude", pos: "noun", ru: ["отношение", "настрой"], ipa: "/ˈæt.ɪ.tjuːd/", exEn: "A positive attitude helps a lot.", exRu: "Позитивный настрой очень помогает.", cefr: "B1" },
      { en: "in addition", pos: "phrase", ru: ["кроме того", "вдобавок"], ipa: "/ɪn əˈdɪʃ.ən/", exEn: "In addition, the price includes breakfast.", exRu: "Кроме того, в цену входит завтрак.", cefr: "B1" },
      { en: "on the other hand", pos: "phrase", ru: ["с другой стороны"], ipa: "/ɒn ði ˌʌð.ə ˈhænd/", exEn: "On the other hand, it is cheaper.", exRu: "С другой стороны, это дешевле.", cefr: "B1" },
      { en: "as a result", pos: "phrase", ru: ["в результате"], ipa: "/əz ə rɪˈzʌlt/", exEn: "He practised daily and as a result he won.", exRu: "Он занимался ежедневно и в результате победил.", cefr: "B1" },
    ],
  },

  // ─── Фразовые глаголы и идиомы (B1) ────────────────
  {
    theme: "phrases_b1",
    title: "Фразовые глаголы и идиомы B1",
    emoji: "🧩",
    description: "Самые нужные фразовые глаголы и идиомы среднего уровня.",
    cefrLevel: "B1",
    words: [
      { en: "look forward to", pos: "phrasal verb", ru: ["ждать с нетерпением"], ipa: "/ˌlʊk ˈfɔː.wəd tə/", exEn: "I look forward to your reply.", exRu: "С нетерпением жду твоего ответа.", cefr: "B1" },
      { en: "put off", pos: "phrasal verb", ru: ["откладывать"], ipa: "/ˌpʊt ˈɒf/", exEn: "Don't put off your homework until midnight.", exRu: "Не откладывай домашку до полуночи.", cefr: "B1" },
      { en: "run out of", pos: "phrasal verb", ru: ["заканчиваться", "исчерпать запас"], ipa: "/ˌrʌn ˈaʊt əv/", exEn: "We ran out of milk this morning.", exRu: "У нас утром закончилось молоко.", cefr: "B1" },
      { en: "come up with", pos: "phrasal verb", ru: ["придумать", "предложить идею"], ipa: "/ˌkʌm ʌp ˈwɪð/", exEn: "She came up with a brilliant idea.", exRu: "Она придумала блестящую идею.", cefr: "B1" },
      { en: "get along with", pos: "phrasal verb", ru: ["ладить с кем-то"], ipa: "/ˌɡet əˈlɒŋ wɪð/", exEn: "I get along with my classmates.", exRu: "Я хорошо лажу с одноклассниками.", cefr: "B1" },
      { en: "keep in touch", pos: "idiom", ru: ["поддерживать связь"], ipa: "/ˌkiːp ɪn ˈtʌtʃ/", exEn: "Let's keep in touch after the course.", exRu: "Давай поддерживать связь после курса.", cefr: "B1" },
      { en: "make sense", pos: "idiom", ru: ["иметь смысл", "быть понятным"], ipa: "/ˌmeɪk ˈsens/", exEn: "Your explanation makes sense now.", exRu: "Теперь твоё объяснение понятно.", cefr: "B1" },
      { en: "pay attention to", pos: "collocation", ru: ["обращать внимание на"], ipa: "/ˌpeɪ əˈten.ʃən tə/", exEn: "Pay attention to the spelling.", exRu: "Обращай внимание на написание.", cefr: "B1" },
      { en: "take it easy", pos: "idiom", ru: ["не волнуйся", "относись спокойнее"], ipa: "/ˌteɪk ɪt ˈiː.zi/", exEn: "Take it easy, the exam is not today.", exRu: "Не волнуйся, экзамен не сегодня.", cefr: "B1" },
      { en: "change your mind", pos: "idiom", ru: ["передумать"], ipa: "/ˌtʃeɪndʒ jɔː ˈmaɪnd/", exEn: "You can change your mind until Friday.", exRu: "Ты можешь передумать до пятницы.", cefr: "B1" },
      { en: "on purpose", pos: "phrase", ru: ["специально", "намеренно"], ipa: "/ɒn ˈpɜː.pəs/", exEn: "He did it on purpose, not by accident.", exRu: "Он сделал это специально, а не случайно.", cefr: "B1" },
      { en: "at least", pos: "phrase", ru: ["по крайней мере", "хотя бы"], ipa: "/ət ˈliːst/", exEn: "Read at least ten pages a day.", exRu: "Читай хотя бы десять страниц в день.", cefr: "B1" },
    ],
  },

  // ─── Топ слов и фраз (B2) ──────────────────────────
  {
    theme: "top_b2",
    title: "Топ слов и фраз B2",
    emoji: "⭐",
    description: "Лексика уровня B2: аргументация, оценка, письменная речь.",
    cefrLevel: "B2",
    words: [
      { en: "significant", pos: "adjective", ru: ["значительный", "существенный"], ipa: "/sɪɡˈnɪf.ɪ.kənt/", exEn: "There was a significant improvement.", exRu: "Наблюдалось существенное улучшение.", cefr: "B2" },
      { en: "consider", pos: "verb", ru: ["рассматривать", "считать"], ipa: "/kənˈsɪd.ər/", exEn: "We should consider all the options.", exRu: "Нам следует рассмотреть все варианты.", cefr: "B2" },
      { en: "despite", pos: "preposition", ru: ["несмотря на"], ipa: "/dɪˈspaɪt/", exEn: "Despite the rain, the match continued.", exRu: "Несмотря на дождь, матч продолжился.", cefr: "B2" },
      { en: "reliable", pos: "adjective", ru: ["надёжный"], ipa: "/rɪˈlaɪ.ə.bəl/", exEn: "He is a reliable partner.", exRu: "Он надёжный партнёр.", cefr: "B2" },
      { en: "maintain", pos: "verb", ru: ["поддерживать", "сохранять"], ipa: "/meɪnˈteɪn/", exEn: "It is hard to maintain such a pace.", exRu: "Такой темп трудно поддерживать.", cefr: "B2" },
      { en: "consequence", pos: "noun", ru: ["последствие"], ipa: "/ˈkɒn.sɪ.kwəns/", exEn: "Every decision has consequences.", exRu: "У каждого решения есть последствия.", cefr: "B2" },
      { en: "assume", pos: "verb", ru: ["предполагать", "допускать"], ipa: "/əˈsjuːm/", exEn: "I assume you have read the text.", exRu: "Я предполагаю, что ты прочитал текст.", cefr: "B2" },
      { en: "nevertheless", pos: "adverb", ru: ["тем не менее"], ipa: "/ˌnev.ə.ðəˈles/", exEn: "It was risky; nevertheless, they tried.", exRu: "Это было рискованно; тем не менее они попробовали.", cefr: "B2" },
      { en: "take into account", pos: "collocation", ru: ["принимать во внимание"], ipa: "/ˌteɪk ˌɪn.tuː əˈkaʊnt/", exEn: "Take into account the time difference.", exRu: "Прими во внимание разницу во времени.", cefr: "B2" },
      { en: "to some extent", pos: "phrase", ru: ["в некоторой степени"], ipa: "/tə ˌsʌm ɪkˈstent/", exEn: "I agree with you to some extent.", exRu: "В некоторой степени я с тобой согласен.", cefr: "B2" },
      { en: "in the long run", pos: "idiom", ru: ["в долгосрочной перспективе"], ipa: "/ɪn ðə ˌlɒŋ ˈrʌn/", exEn: "In the long run, reading pays off.", exRu: "В долгосрочной перспективе чтение окупается.", cefr: "B2" },
      { en: "draw a conclusion", pos: "collocation", ru: ["делать вывод"], ipa: "/ˌdrɔː ə kənˈkluː.ʒən/", exEn: "It is too early to draw a conclusion.", exRu: "Ещё рано делать вывод.", cefr: "B2" },
    ],
  },

  // ─── Идиомы и коллокации (B2) ──────────────────────
  {
    theme: "phrases_b2",
    title: "Идиомы и коллокации B2",
    emoji: "🎯",
    description: "Естественные идиомы и сочетания, которые отличают уверенную речь.",
    cefrLevel: "B2",
    words: [
      { en: "bear in mind", pos: "idiom", ru: ["иметь в виду", "учитывать"], ipa: "/ˌbeər ɪn ˈmaɪnd/", exEn: "Bear in mind that the office closes at six.", exRu: "Имей в виду, что офис закрывается в шесть.", cefr: "B2" },
      { en: "get the hang of", pos: "idiom", ru: ["освоить", "научиться справляться"], ipa: "/ˌɡet ðə ˈhæŋ əv/", exEn: "After a week I got the hang of the software.", exRu: "Через неделю я освоил эту программу.", cefr: "B2" },
      { en: "jump to conclusions", pos: "idiom", ru: ["делать поспешные выводы"], ipa: "/ˌdʒʌmp tə kənˈkluː.ʒənz/", exEn: "Let's not jump to conclusions without data.", exRu: "Не будем делать поспешных выводов без данных.", cefr: "B2" },
      { en: "be on the same page", pos: "idiom", ru: ["понимать друг друга одинаково"], ipa: "/bi ɒn ðə ˌseɪm ˈpeɪdʒ/", exEn: "Let's meet to make sure we're on the same page.", exRu: "Давай встретимся, чтобы убедиться, что мы понимаем всё одинаково.", cefr: "B2" },
      { en: "cut corners", pos: "idiom", ru: ["халтурить", "экономить в ущерб качеству"], ipa: "/ˌkʌt ˈkɔː.nəz/", exEn: "Don't cut corners on safety checks.", exRu: "Не халтурь с проверками безопасности.", cefr: "B2" },
      { en: "a blessing in disguise", pos: "idiom", ru: ["не было бы счастья, да несчастье помогло"], ipa: "/ə ˌbles.ɪŋ ɪn dɪsˈɡaɪz/", exEn: "Losing that job was a blessing in disguise.", exRu: "Потеря той работы оказалась скрытым благом.", cefr: "B2" },
      { en: "beat around the bush", pos: "idiom", ru: ["говорить обиняками", "ходить вокруг да около"], ipa: "/ˌbiːt əˌraʊnd ðə ˈbʊʃ/", exEn: "Stop beating around the bush and answer.", exRu: "Перестань ходить вокруг да около и ответь.", cefr: "B2" },
      { en: "go the extra mile", pos: "idiom", ru: ["сделать больше, чем требуется"], ipa: "/ˌɡəʊ ði ˌek.strə ˈmaɪl/", exEn: "She always goes the extra mile for her students.", exRu: "Она всегда делает для учеников больше, чем требуется.", cefr: "B2" },
      { en: "hit the nail on the head", pos: "idiom", ru: ["попасть в точку"], ipa: "/ˌhɪt ðə ˈneɪl ɒn ðə ˈhed/", exEn: "Your comment hit the nail on the head.", exRu: "Твой комментарий попал в точку.", cefr: "B2" },
      { en: "break the news", pos: "collocation", ru: ["сообщить новость"], ipa: "/ˌbreɪk ðə ˈnjuːz/", exEn: "Who will break the news to her?", exRu: "Кто сообщит ей новость?", cefr: "B2" },
      { en: "meet a deadline", pos: "collocation", ru: ["уложиться в срок"], ipa: "/ˌmiːt ə ˈded.laɪn/", exEn: "We met the deadline despite the delay.", exRu: "Мы уложились в срок несмотря на задержку.", cefr: "B2" },
      { en: "raise awareness", pos: "collocation", ru: ["повышать осведомлённость"], ipa: "/ˌreɪz əˈweə.nəs/", exEn: "The campaign raises awareness of recycling.", exRu: "Кампания повышает осведомлённость о переработке.", cefr: "B2" },
    ],
  },

  // ─── Топ слов и фраз (C1) ──────────────────────────
  {
    theme: "top_c1",
    title: "Топ слов и фраз C1",
    emoji: "⭐",
    description: "Точная лексика уровня C1 для аналитической и академической речи.",
    cefrLevel: "C1",
    words: [
      { en: "inevitable", pos: "adjective", ru: ["неизбежный"], ipa: "/ɪˈnev.ɪ.tə.bəl/", exEn: "A certain amount of change is inevitable.", exRu: "Определённые изменения неизбежны.", cefr: "C1" },
      { en: "profound", pos: "adjective", ru: ["глубокий", "основательный"], ipa: "/prəˈfaʊnd/", exEn: "The book had a profound effect on me.", exRu: "Книга оказала на меня глубокое влияние.", cefr: "C1" },
      { en: "undermine", pos: "verb", ru: ["подрывать"], ipa: "/ˌʌn.dəˈmaɪn/", exEn: "Constant criticism undermines confidence.", exRu: "Постоянная критика подрывает уверенность.", cefr: "C1" },
      { en: "compelling", pos: "adjective", ru: ["убедительный", "неотразимый"], ipa: "/kəmˈpel.ɪŋ/", exEn: "She made a compelling argument.", exRu: "Она привела убедительный аргумент.", cefr: "C1" },
      { en: "discrepancy", pos: "noun", ru: ["расхождение", "несоответствие"], ipa: "/dɪˈskrep.ən.si/", exEn: "There is a discrepancy between the two reports.", exRu: "Между двумя отчётами есть расхождение.", cefr: "C1" },
      { en: "advocate", pos: "verb", ru: ["выступать за", "отстаивать"], ipa: "/ˈæd.və.keɪt/", exEn: "He advocates a gradual reform.", exRu: "Он выступает за постепенную реформу.", cefr: "C1" },
      { en: "nuance", pos: "noun", ru: ["нюанс", "тонкость"], ipa: "/ˈnjuː.ɑːns/", exEn: "Translation must capture every nuance.", exRu: "Перевод должен передавать каждый нюанс.", cefr: "C1" },
      { en: "albeit", pos: "conjunction", ru: ["хотя и", "пусть и"], ipa: "/ɔːlˈbiː.ɪt/", exEn: "The result was positive, albeit modest.", exRu: "Результат был положительным, пусть и скромным.", cefr: "C1" },
      { en: "in retrospect", pos: "phrase", ru: ["оглядываясь назад"], ipa: "/ɪn ˈret.rə.spekt/", exEn: "In retrospect, I should have asked for help.", exRu: "Оглядываясь назад, мне стоило попросить помощи.", cefr: "C1" },
      { en: "by and large", pos: "phrase", ru: ["в целом"], ipa: "/ˌbaɪ ən ˈlɑːdʒ/", exEn: "By and large, the plan succeeded.", exRu: "В целом план удался.", cefr: "C1" },
      { en: "bear the brunt of", pos: "idiom", ru: ["принять на себя основной удар"], ipa: "/ˌbeə ðə ˈbrʌnt əv/", exEn: "Small firms bore the brunt of the crisis.", exRu: "Основной удар кризиса приняли на себя малые фирмы.", cefr: "C1" },
      { en: "a case in point", pos: "phrase", ru: ["наглядный пример"], ipa: "/ə ˌkeɪs ɪn ˈpɔɪnt/", exEn: "This project is a case in point.", exRu: "Этот проект — наглядный пример.", cefr: "C1" },
    ],
  },

  // ─── Продвинутые идиомы (C1) ───────────────────────
  {
    theme: "phrases_c1",
    title: "Продвинутые идиомы C1",
    emoji: "🧠",
    description: "Идиомы, которые встречаются в прессе, дискуссиях и деловой речи.",
    cefrLevel: "C1",
    words: [
      { en: "a double-edged sword", pos: "idiom", ru: ["палка о двух концах"], ipa: "/ə ˌdʌb.əl edʒd ˈsɔːd/", exEn: "Social media is a double-edged sword.", exRu: "Социальные сети — палка о двух концах.", cefr: "C1" },
      { en: "the tip of the iceberg", pos: "idiom", ru: ["лишь верхушка айсберга"], ipa: "/ðə ˌtɪp əv ði ˈaɪs.bɜːɡ/", exEn: "These complaints are just the tip of the iceberg.", exRu: "Эти жалобы — лишь верхушка айсберга.", cefr: "C1" },
      { en: "take with a grain of salt", pos: "idiom", ru: ["воспринимать критически"], ipa: "/ˌteɪk wɪð ə ˌɡreɪn əv ˈsɒlt/", exEn: "Take his advice with a grain of salt.", exRu: "Воспринимай его совет критически.", cefr: "C1" },
      { en: "throw in the towel", pos: "idiom", ru: ["сдаться", "признать поражение"], ipa: "/ˌθrəʊ ɪn ðə ˈtaʊ.əl/", exEn: "After three attempts he threw in the towel.", exRu: "После трёх попыток он сдался.", cefr: "C1" },
      { en: "the elephant in the room", pos: "idiom", ru: ["очевидная проблема, о которой молчат"], ipa: "/ði ˌel.ɪ.fənt ɪn ðə ˈruːm/", exEn: "Nobody mentioned the elephant in the room.", exRu: "Никто не упомянул очевидную проблему.", cefr: "C1" },
      { en: "play devil's advocate", pos: "idiom", ru: ["намеренно возражать для проверки идеи"], ipa: "/ˌpleɪ ˌdev.əlz ˈæd.və.kət/", exEn: "Let me play devil's advocate for a moment.", exRu: "Позволь мне на минуту сыграть роль оппонента.", cefr: "C1" },
      { en: "raise the bar", pos: "idiom", ru: ["поднять планку"], ipa: "/ˌreɪz ðə ˈbɑːr/", exEn: "Her essay raised the bar for the whole class.", exRu: "Её эссе подняло планку для всего класса.", cefr: "C1" },
      { en: "set in stone", pos: "idiom", ru: ["высечено в камне", "окончательно решено"], ipa: "/ˌset ɪn ˈstəʊn/", exEn: "The schedule is not set in stone.", exRu: "Расписание ещё не окончательное.", cefr: "C1" },
      { en: "water under the bridge", pos: "idiom", ru: ["дело прошлое", "быльём поросло"], ipa: "/ˌwɔː.tər ˌʌn.də ðə ˈbrɪdʒ/", exEn: "That argument is water under the bridge now.", exRu: "Та ссора — дело прошлое.", cefr: "C1" },
      { en: "burn your bridges", pos: "idiom", ru: ["сжигать мосты"], ipa: "/ˌbɜːn jɔː ˈbrɪdʒ.ɪz/", exEn: "Don't burn your bridges when you leave a job.", exRu: "Не сжигай мосты, уходя с работы.", cefr: "C1" },
      { en: "a storm in a teacup", pos: "idiom", ru: ["буря в стакане воды"], ipa: "/ə ˌstɔːm ɪn ə ˈtiː.kʌp/", exEn: "The scandal was a storm in a teacup.", exRu: "Скандал оказался бурей в стакане воды.", cefr: "C1" },
      { en: "call it a day", pos: "idiom", ru: ["на этом закончить"], ipa: "/ˌkɔːl ɪt ə ˈdeɪ/", exEn: "We've done enough — let's call it a day.", exRu: "Мы сделали достаточно — на этом закончим.", cefr: "C1" },
    ],
  },

  // ─── Топ слов и фраз (C2) ──────────────────────────
  {
    theme: "top_c2",
    title: "Топ слов и фраз C2",
    emoji: "⭐",
    description: "Лексика уровня C2: оттенки смысла, книжный и научный регистр.",
    cefrLevel: "C2",
    words: [
      { en: "ubiquitous", pos: "adjective", ru: ["повсеместный", "встречающийся везде"], ipa: "/juːˈbɪk.wɪ.təs/", exEn: "Smartphones are now ubiquitous.", exRu: "Смартфоны теперь повсеместны.", cefr: "C2" },
      { en: "quintessential", pos: "adjective", ru: ["образцовый", "типичный", "воплощающий суть"], ipa: "/ˌkwɪn.tɪˈsen.ʃəl/", exEn: "He is the quintessential English gentleman.", exRu: "Он — воплощение английского джентльмена.", cefr: "C2" },
      { en: "ostensibly", pos: "adverb", ru: ["якобы", "на первый взгляд"], ipa: "/ɒsˈten.sə.bli/", exEn: "He came ostensibly to help, but stayed silent.", exRu: "Он пришёл якобы помочь, но промолчал.", cefr: "C2" },
      { en: "paradigm", pos: "noun", ru: ["парадигма", "модель"], ipa: "/ˈpær.ə.daɪm/", exEn: "The discovery shifted the whole paradigm.", exRu: "Открытие сместило всю парадигму.", cefr: "C2" },
      { en: "juxtapose", pos: "verb", ru: ["сопоставлять", "помещать рядом"], ipa: "/ˌdʒʌk.stəˈpəʊz/", exEn: "The film juxtaposes wealth and poverty.", exRu: "Фильм сопоставляет богатство и бедность.", cefr: "C2" },
      { en: "idiosyncrasy", pos: "noun", ru: ["особенность", "чудачество"], ipa: "/ˌɪd.i.əˈsɪŋ.krə.si/", exEn: "Every writer has his idiosyncrasies.", exRu: "У каждого писателя свои особенности.", cefr: "C2" },
      { en: "perfunctory", pos: "adjective", ru: ["поверхностный", "сделанный для галочки"], ipa: "/pəˈfʌŋk.tər.i/", exEn: "He gave a perfunctory nod and left.", exRu: "Он формально кивнул и ушёл.", cefr: "C2" },
      { en: "exacerbate", pos: "verb", ru: ["обострять", "усугублять"], ipa: "/ɪɡˈzæs.ə.beɪt/", exEn: "The delay exacerbated the problem.", exRu: "Задержка усугубила проблему.", cefr: "C2" },
      { en: "tantamount to", pos: "phrase", ru: ["равносильно чему-то"], ipa: "/ˈtæn.tə.maʊnt tuː/", exEn: "Silence here is tantamount to consent.", exRu: "Молчание здесь равносильно согласию.", cefr: "C2" },
      { en: "insofar as", pos: "phrase", ru: ["в той мере, в какой"], ipa: "/ˌɪn.səʊˈfɑːr əz/", exEn: "It is useful insofar as it saves time.", exRu: "Это полезно в той мере, в какой экономит время.", cefr: "C2" },
      { en: "a foregone conclusion", pos: "idiom", ru: ["предрешённый исход"], ipa: "/ə ˌfɔː.ɡɒn kənˈkluː.ʒən/", exEn: "The outcome was a foregone conclusion.", exRu: "Исход был предрешён.", cefr: "C2" },
      { en: "ad nauseam", pos: "phrase", ru: ["до тошноты", "до бесконечности"], ipa: "/ˌæd ˈnɔː.zi.æm/", exEn: "The point was repeated ad nauseam.", exRu: "Эту мысль повторяли до тошноты.", cefr: "C2" },
    ],
  },

  // ─── Идиоматика уровня носителя (C2) ───────────────
  {
    theme: "phrases_c2",
    title: "Идиоматика уровня носителя C2",
    emoji: "🏛️",
    description: "Книжные и культурно нагруженные идиомы, близкие к речи носителя.",
    cefrLevel: "C2",
    words: [
      { en: "a Pyrrhic victory", pos: "idiom", ru: ["пиррова победа"], ipa: "/ə ˌpɪr.ɪk ˈvɪk.tər.i/", exEn: "Winning the case was a Pyrrhic victory.", exRu: "Победа в деле оказалась пирровой.", cefr: "C2" },
      { en: "gild the lily", pos: "idiom", ru: ["переусердствовать с украшением"], ipa: "/ˌɡɪld ðə ˈlɪl.i/", exEn: "Adding music to the speech would gild the lily.", exRu: "Добавлять музыку к речи — это уже излишество.", cefr: "C2" },
      { en: "cut the Gordian knot", pos: "idiom", ru: ["разрубить гордиев узел"], ipa: "/ˌkʌt ðə ˌɡɔː.di.ən ˈnɒt/", exEn: "One bold decision cut the Gordian knot.", exRu: "Одно смелое решение разрубило гордиев узел.", cefr: "C2" },
      { en: "the die is cast", pos: "idiom", ru: ["жребий брошен"], ipa: "/ðə ˌdaɪ ɪz ˈkɑːst/", exEn: "We signed the contract — the die is cast.", exRu: "Мы подписали договор — жребий брошен.", cefr: "C2" },
      { en: "beyond the pale", pos: "idiom", ru: ["за границами допустимого"], ipa: "/bɪˌjɒnd ðə ˈpeɪl/", exEn: "His remarks were beyond the pale.", exRu: "Его замечания были за границами допустимого.", cefr: "C2" },
      { en: "a fly in the ointment", pos: "idiom", ru: ["ложка дёгтя в бочке мёда"], ipa: "/ə ˌflaɪ ɪn ði ˈɔɪnt.mənt/", exEn: "The only fly in the ointment was the price.", exRu: "Единственной ложкой дёгтя была цена.", cefr: "C2" },
      { en: "preach to the choir", pos: "idiom", ru: ["убеждать уже согласных"], ipa: "/ˌpriːtʃ tə ðə ˈkwaɪər/", exEn: "Telling me to read more is preaching to the choir.", exRu: "Убеждать меня читать больше — значит убеждать согласного.", cefr: "C2" },
      { en: "leave no stone unturned", pos: "idiom", ru: ["не оставить камня на камне в поисках"], ipa: "/ˌliːv nəʊ ˌstəʊn ʌnˈtɜːnd/", exEn: "The team left no stone unturned in the research.", exRu: "Команда обшарила в исследовании всё до мелочей.", cefr: "C2" },
      { en: "an albatross around your neck", pos: "idiom", ru: ["тяжкое бремя"], ipa: "/ən ˈæl.bə.trɒs əˌraʊnd jɔː ˈnek/", exEn: "The old debt is an albatross around his neck.", exRu: "Старый долг стал для него тяжким бременем.", cefr: "C2" },
      { en: "put the cart before the horse", pos: "idiom", ru: ["делать в обратном порядке"], ipa: "/ˌpʊt ðə ˈkɑːt bɪˌfɔː ðə ˈhɔːs/", exEn: "Designing before research puts the cart before the horse.", exRu: "Проектировать до исследования — значит ставить телегу впереди лошади.", cefr: "C2" },
      { en: "throw caution to the wind", pos: "idiom", ru: ["отбросить осторожность"], ipa: "/ˌθrəʊ ˈkɔː.ʃən tə ðə ˈwɪnd/", exEn: "He threw caution to the wind and invested everything.", exRu: "Он отбросил осторожность и вложил всё.", cefr: "C2" },
      { en: "damn with faint praise", pos: "idiom", ru: ["похвалить так, что лучше бы промолчал"], ipa: "/ˌdæm wɪð ˌfeɪnt ˈpreɪz/", exEn: "The review damned the novel with faint praise.", exRu: "Рецензия похвалила роман так, что лучше бы промолчала.", cefr: "C2" },
    ],
  },
];


// ─────────────────────────────────────────────────────────────────────────────
// Картинки-подсказки для младших учеников.
//
// Слово + картинка запоминаются заметно лучше, чем слово + перевод, но тянуть в
// офлайн-датасет настоящие изображения незачем: эмодзи рисуется системой, ничего
// не грузится по сети и работает и на web, и на нативе. Значение попадает в
// words.emoji при сидинге (seed-flashcards.ts) и показывается на лице карточки.
//
// Ключ — английское слово из датасета в нижнем регистре. Абстрактные слова
// намеренно оставлены без картинки: плохая картинка хуже отсутствия картинки.
// Проверяется scripts/validate-flashcards.mjs (pnpm validate:flashcards).
// ─────────────────────────────────────────────────────────────────────────────
export const WORD_EMOJI: Record<string, string> = {
  // еда и напитки
  apple: "🍎", bread: "🍞", water: "💧", milk: "🥛", cheese: "🧀", egg: "🥚",
  meat: "🥩", vegetable: "🥕", fruit: "🍇", breakfast: "🥣", dinner: "🍝",
  meal: "🍲", sugar: "🍬", salt: "🧂", delicious: "😋", hungry: "🤤",
  // животные
  dog: "🐶", cat: "🐱", horse: "🐴", bird: "🐦", fish: "🐟", cow: "🐮",
  sheep: "🐑", bear: "🐻", lion: "🦁", elephant: "🐘", mouse: "🐭",
  rabbit: "🐰", snake: "🐍", insect: "🐞", wild: "🐅",
  // транспорт и путешествия
  car: "🚗", bus: "🚌", train: "🚆", plane: "✈️", ship: "🚢", bicycle: "🚲",
  taxi: "🚕", station: "🚉", airport: "🛫", ticket: "🎫", road: "🛣️",
  luggage: "🧳", passport: "🛂", hotel: "🏨", map: "🗺️", trip: "🚙",
  vacation: "🏝️", beach: "🏖️", tourist: "📸", arrive: "🛬",
  // семья и люди
  mother: "👩", father: "👨", sister: "👧", brother: "👦", son: "🧑",
  daughter: "👧", parents: "👨‍👩‍👦", grandmother: "👵", child: "🧒",
  friend: "👫", people: "👥", wife: "👰", husband: "🤵", married: "💍",
  doctor: "👩‍⚕️", manager: "🧑‍💼",
  // дом
  house: "🏠", room: "🛋️", door: "🚪", window: "🪟", table: "🍽️",
  chair: "🪑", bed: "🛏️", kitchen: "🍳", floor: "🧹", wall: "🧱",
  garden: "🌷", furniture: "🛋️", comfortable: "🛋️", clean: "🧼",
  // тело и здоровье
  head: "🙂", hand: "✋", leg: "🦵", eye: "👁️", tooth: "🦷", heart: "❤️",
  medicine: "💊", healthy: "🥗", sick: "🤒", tired: "🥱", sleep: "😴",
  // природа и погода
  tree: "🌳", flower: "🌸", forest: "🌲", river: "🏞️", sea: "🌊",
  mountain: "⛰️", sky: "☁️", sun: "☀️", rain: "🌧️", snow: "❄️", wind: "💨",
  weather: "🌤️",
  // техника
  computer: "💻", phone: "📱", screen: "🖥️", keyboard: "⌨️", internet: "🌐",
  password: "🔑", message: "💬", download: "⬇️",
  // школа, работа, город
  book: "📕", school: "🏫", city: "🏙️", office: "🏢", job: "💼", work: "🛠️",
  money: "💰", meeting: "📋", interview: "🎤", time: "⏰", learn: "📚",
  // действия и оценки
  write: "✍️", speak: "🗣️", see: "👀", think: "🤔", remember: "🧠",
  help: "🤝", give: "🎁", buy: "🛒", find: "🔍", make: "🔨", go: "🚶",
  taste: "👅", happy: "😀", good: "👍", important: "❗", new: "🆕",
  beautiful: "😍", smart: "🤓",
};

/** Картинка-подсказка для английского слова (или undefined, если её нет). */
export function emojiFor(english: string): string | undefined {
  return WORD_EMOJI[english.trim().toLowerCase()];
}

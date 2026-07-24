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
    ],
  },

  // ─── Топ базовых слов (A1) ──────────────────────────────────────
  {
    theme: "top_a1",
    title: "Топ базовых слов A1",
    emoji: "⭐",
    description: "Самые частые слова для начинающих.",
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
    ],
  },
];


// Дополнительный список кандидатов в словосочетания.
//
// Это ТОЛЬКО поисковые запросы. Тематические словари Oxford почти не содержат
// многословных статей уровня A1–A2, поэтому ходовые бытовые сочетания ищем
// адресно. В датасет попадёт лишь то, что нашлось в Cambridge: уровень, перевод
// и пример берутся из статьи, кандидат без статьи просто отбрасывается.
export const EXTRA_PHRASES = {
  food: [
    "have breakfast", "have lunch", "have dinner", "fast food", "junk food", "eat out",
    "food shopping", "ice cream", "orange juice", "cup of tea", "glass of water",
    "fizzy drink", "ready meal", "takeaway food", "healthy eating", "table manners",
    "eat up", "drink up", "warm up", "cut down on", "a piece of cake", "food poisoning",
    "shopping list", "side dish", "main course", "soft drink", "home cooking",
  ],
  animals: [
    "pet shop", "guide dog", "wild animal", "farm animal", "polar bear", "guinea pig",
    "teddy bear", "domestic animal", "stray dog", "bird of prey", "look after",
    "take for a walk", "animal welfare", "endangered species", "wildlife park",
    "zoo keeper", "pet food", "hunting dog", "sheep dog", "cat food", "run away",
    "raining cats and dogs", "let the cat out of the bag", "animal rights",
  ],
  transport: [
    "bus stop", "train station", "car park", "traffic jam", "rush hour", "driving licence",
    "public transport", "get on", "get off", "take off", "petrol station", "road sign",
    "speed limit", "seat belt", "ticket office", "return ticket", "single ticket",
    "railway station", "traffic lights", "pick up", "drop off", "set off", "level crossing",
    "back seat", "front seat", "car crash", "hire car", "miss the bus",
  ],
  family: [
    "get married", "grow up", "family tree", "best friend", "fall in love", "get on with",
    "look after", "bring up", "close friend", "only child", "single parent", "get to know",
    "take after", "make friends", "next of kin", "family life", "grandparents",
    "elder brother", "younger sister", "get divorced", "settle down", "look up to",
  ],
  home: [
    "living room", "dining room", "front door", "washing machine", "central heating",
    "tidy up", "do the washing up", "move house", "block of flats", "estate agent",
    "back garden", "housework", "make the bed", "hoover the carpet", "chest of drawers",
    "coffee table", "light switch", "spare room", "detached house", "semi-detached house",
    "put away", "throw away", "clean up", "do up",
  ],
  body_health: [
    "feel better", "get better", "have a cold", "sore throat", "high temperature",
    "take medicine", "keep fit", "work out", "go to the doctor", "first aid",
    "blood pressure", "heart attack", "side effect", "healthy diet", "get worse",
    "put on weight", "lose weight", "give up", "look after yourself", "food poisoning",
    "waiting room", "medical check", "eye test", "brush your teeth", "get over",
  ],
  work: [
    "full-time job", "part-time job", "job interview", "curriculum vitae", "pay rise",
    "work experience", "day off", "apply for", "take on", "look for", "get a job",
    "work from home", "office hours", "team work", "job title", "line manager",
    "career path", "work placement", "hand in", "set up", "take over", "carry out",
    "make a living", "annual leave", "sick leave", "job satisfaction",
  ],
  nature: [
    "climate change", "global warming", "fresh air", "national park", "wild flower",
    "clear up", "die out", "cut down", "throw away", "greenhouse effect", "solar power",
    "wind farm", "natural resources", "sea level", "heavy rain", "weather forecast",
    "environmental protection", "plant a tree", "endangered species", "air pollution",
    "recycling bin", "carbon footprint", "renewable energy", "warm up",
  ],
  technology: [
    "mobile phone", "text message", "social media", "search engine", "web page",
    "log in", "log out", "switch on", "switch off", "plug in", "download an app",
    "hard drive", "video call", "email address", "computer game", "smart phone",
    "back up", "set up", "sign up", "online shopping", "artificial intelligence",
    "digital camera", "data protection", "screen time", "wireless network",
  ],
  travel: [
    "go on holiday", "travel agent", "package holiday", "boarding pass", "hand luggage",
    "check in", "check out", "book a room", "youth hostel", "bed and breakfast",
    "sightseeing tour", "travel insurance", "duty free", "guided tour", "day trip",
    "set off", "get away", "look around", "tourist information", "hotel room",
    "departure lounge", "passport control", "left luggage", "souvenir shop",
  ],
};

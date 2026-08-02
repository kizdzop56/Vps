// Разовый скрипт-миграция: перераскладывает уже импортированные слова
// (vocabulary-a1.ts .. vocabulary-c1.ts) по единому набору из 20 осмысленных
// тем вместо колод «Топ-слова {LEVEL} (N/M)». Слова НЕ перекачиваются из сети —
// вся работа идёт с уже существующими SeedWord (en/pos/ru/ipa/exEn/exRu/cefr),
// только пересобирается theme/title/emoji/description и разбиение на колоды.
//
// Запуск: pnpm --filter @workspace/scripts run reclassify-vocab
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SeedDeck, SeedWord } from "./data/flashcards-data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "data"); // scripts/src/data

const LEVELS = ["a1", "a2", "b1", "b2", "c1"] as const;
type Level = (typeof LEVELS)[number];

// ── 20 канонических тем: ключ -> заголовок/эмодзи/описание + ключевые слова ──
type ThemeDef = { title: string; emoji: string; description: string; words: string[] };

const THEMES: Record<string, ThemeDef> = {
  food_drink: {
    title: "Еда и напитки", emoji: "🍔", description: "Еда, напитки, кухня и приготовление пищи.",
    words: ["food","drink","eat","eating","meal","breakfast","lunch","dinner","supper","bread","meat","fish","fruit",
      "vegetable","apple","banana","orange","potato","tomato","onion","garlic","rice","chicken","beef","pork","lamb",
      "milk","cheese","butter","egg","sugar","salt","pepper","spice","spicy","coffee","tea","juice","water","wine","beer",
      "cook","cooking","cooked","recipe","kitchen","restaurant","cafe","café","menu","waiter","waitress","hungry","thirsty",
      "taste","tasty","delicious","sweet","sour","bitter","fresh","snack","dessert","cake","chocolate","soup","sandwich",
      "pizza","pasta","noodle","bake","baking","fry","fried","boil","boiled","roast","grill","grilled","ingredient",
      "diet","vegetarian","vegan","organic","flavour","flavor","nutrition","nutritious","dish","cuisine","seafood",
      "grocery","groceries","supermarket","bakery","biscuit","cookie","yogurt","yoghurt","cream","honey","jam","oil",
      "vinegar","sauce","spoon","fork","knife","plate","bowl","cup","glass","napkin","appetite","calorie","protein",
      "carbohydrate","fibre","fiber","vitamin","mineral","additive","preservative","feast","banquet","picnic",
      "starve","starving","overeat","chew","swallow","sip","gulp","bite","peel","slice","chop","stir","mix","blend",
      "marinate","season","seasoning","garnish","reheat","leftover","takeaway","takeout","carrot","salad","bean",
      "lemon","nut","dairy"],
  },
  animals_nature: {
    title: "Животные и природа", emoji: "🌿", description: "Животные, растения и природные явления.",
    words: ["animal","dog","cat","bird","fish","horse","cow","sheep","pig","chicken","duck","rabbit","mouse",
      "lion","tiger","elephant","bear","wolf","fox","monkey","snake","insect","bee","butterfly","spider","ant",
      "pet","wild","zoo","farm","tail","wing","paw","claw","fur","feather","nature","natural","forest","tree","plant",
      "flower","grass","leaf","leaves","root","branch","seed","garden","gardening","mountain","river","lake","sea","ocean",
      "beach","island","desert","jungle","valley","hill","field","soil","earth","planet","universe","sky","star","moon",
      "sun","cloud","rock","stone","sand","wave","wildlife","species","habitat","ecosystem","biodiversity","extinct",
      "extinction","predator","prey","mammal","reptile","amphibian","creature","breed","nest","hive","herd",
      "flock","pack","cave","cliff","volcano","waterfall","coast","shore","stream","pond","marsh","wetland","meadow",
      "wilderness","organism","cell","cellular","gene","genetic","evolution","evolve","conservation","drought",
      "greenhouse","emission","fossil","sustainable","pollution","pollute","recycle","recycling","environment",
      "environmental","ecology","ecological","biology","biological","botany","zoology","bark"],
  },
  home_life: {
    title: "Дом и быт", emoji: "🏠", description: "Дом, быт и предметы обихода.",
    words: ["house","home","room","kitchen","bedroom","bathroom","living room","garden","door","window","wall","roof",
      "floor","ceiling","furniture","table","chair","bed","sofa","couch","lamp","key","clean","cleaning","cleaner","wash",
      "washing","tidy","flat","apartment","address","neighbour","neighbor","neighbourhood","rent","landlord","tenant",
      "mortgage","property","move","moving","household","chore","chores","laundry","dishwasher","fridge","refrigerator",
      "oven","microwave","vacuum","broom","mop","curtain","carpet","rug","shelf","shelves","cupboard","drawer","wardrobe",
      "mirror","pillow","blanket","sheet","towel","soap","shampoo","toothbrush","balcony","yard","fence","gate","porch",
      "attic","basement","cellar","staircase","stairs","hallway","corridor","tile","paint","decorate","decoration",
      "renovate","renovation","furnish","furnished","appliance","utility","utilities","electricity","gas","plumbing",
      "heating","cooling","air conditioning","doorbell","lock","locksmith","housework","housekeeping",
      "bag","bath","bottle","box","desk","clock","sweater","toilet","shower","pool","routine","cloth","cottage","pot",
      "pan","tent","kit","basket","brick","candle","ladder","cushion"],
  },
  family_people: {
    title: "Семья и люди", emoji: "👪", description: "Семья, родственники и люди вообще.",
    words: ["family","mother","father","parent","child","children","son","daughter","brother","sister",
      "grandmother","grandfather","grandparent","husband","wife","spouse","baby","aunt","uncle","cousin","relative",
      "marriage","marry","married","wedding","birth","born","people","person","man","woman","boy","girl","adult","teenager",
      "elderly","couple","partner","widow","widower","divorce","divorced","stepmother","stepfather","stepbrother",
      "stepsister","sibling","twin","nephew","niece","in-law","generation","ancestor","descendant","orphan",
      "guardian","upbringing","childhood","infancy","adolescence","toddler","newborn","pregnant","pregnancy","fiancé",
      "fiancée","bride","groom","funeral","engagement","anniversary","kinship","dad","mum","boyfriend","girlfriend",
      "life","member","guy","kid","lady","king","queen","prince","princess","hero","god","human","individual",
      "teenager","youngster","youth","adult","fellow","buddy","companion","stranger","peer","adolescent","infant",
      "offspring","descendant"],
  },
  work_study: {
    title: "Работа и учёба", emoji: "💼", description: "Работа, бизнес, школа и учёба.",
    words: ["work","job","office","company","business","boss","colleague","employee","employer","career","salary",
      "meeting","project","task","school","student","teacher","class","lesson","homework","exam","test","university",
      "study","learn","learning","education","educational","educate","degree","subject","course","skill","interview",
      "apply","application","resume","cv","training","trainee","internship","intern","recruit","recruitment","hire","hiring",
      "fire","fired","promotion","promote","retire","retirement","unemployed","unemployment","employment","workplace",
      "workforce","industry","industrial","manufacture","manufacturing","factory","corporation","enterprise","entrepreneur",
      "entrepreneurship","startup","shift","overtime","deadline","assignment","report","presentation","conference",
      "workshop","seminar","lecture","lecturer","professor","academic","academy","campus","curriculum","graduate",
      "graduation","undergraduate","scholarship","tuition","classroom","textbook","qualification","diploma",
      "certificate","apprentice","apprenticeship","supervisor","manager","management","managerial","executive",
      "shareholder","stakeholder","investor","investment","income","revenue","profit","loss","budget","finance",
      "financial","economy","economic","economics","trade","export","import","market","marketing","advertise",
      "advertising","advertisement","sales","customer","client","consumer","negotiate","negotiation","contract","merger",
      "acquisition","deal","agreement","strike","union","labour","labor","wage","freelance","freelancer","outsource",
      "outsourcing","productivity","competitive","competition","competitor","turnover","deficit","surplus","inflation",
      "recession","tax","taxpayer","insurance","pension","payroll","college","library","pen","pencil","paper","page",
      "paragraph","history","geography","practice","success","list","form","record","essay","businessman","chairman",
      "clerk","secretary","assistant","expert","professional","lawyer","engineer","staff","officer","manager","agent",
      "agency","photographer","dentist","detective","sailor","priest","pilot","mentor","tutor"],
  },
  hobby_sport: {
    title: "Хобби и спорт", emoji: "⚽", description: "Спорт, увлечения и свободное время.",
    words: ["sport","football","basketball","tennis","swim","swimming","run","running","gym","exercise","exercising",
      "team","game","play","player","match","ball","hobby","chess","fun","free time","leisure","athlete","athletic",
      "competition","tournament","champion","championship","medal","score","referee","coach","stadium","pitch","court",
      "race","racing","cycling","bike","bicycle","climb","climbing","hike","hiking","camp","camping","fishing","sailing",
      "skiing","skating","boxing","wrestling","volleyball","golf","rugby","cricket","marathon","jog","jogging","fitness",
      "workout","train","training","stretch","stretching","spectator","fan","supporter","party","guitar","piano",
      "baseball","hockey","soccer","ski","cycle"],
  },
  travel_transport: {
    title: "Путешествия и транспорт", emoji: "✈️", description: "Поездки, туризм и транспорт.",
    words: ["travel","trip","journey","holiday","vacation","tourist","tourism","hotel","airport","flight",
      "plane","train","bus","car","taxi","ship","ticket","passport","luggage","map","abroad","visit","tour","guide",
      "drive","driver","driving","road","route","destination","departure","arrival","transport","vehicle","traffic",
      "passenger","border","crossing","motorway","highway","lane","signal","bridge","station","platform",
      "boarding","cabin","captain","pilot","cruise","voyage","expedition","backpack","itinerary","reservation","booking",
      "check-in","baggage","customs","visa","excursion","sightseeing","souvenir"],
  },
  city_places: {
    title: "Город и места", emoji: "🏙️", description: "Города, местность и ориентиры.",
    words: ["city","town","street","building","square","avenue","district","region","area","neighbourhood",
      "downtown","suburb","urban","rural","village","capital","location","located","place","site","landmark","monument",
      "park","zone","block","corner","pavement","sidewalk","crossroad","intersection","skyscraper","tower","bridge",
      "harbor","harbour","port","market square","plaza","alley","lane","boulevard","municipality","council","mayor",
      "population","crowded","spacious","downstairs","upstairs","east","west","north","south","country","world","near",
      "front","local","land","hall","mall","palace","castle","cottage","garage","studio","stage","stair","stairs",
      "entrance","exit","path","edge","territory","estate","county","province","mainland","embassy","cabinet"],
  },
  health_body: {
    title: "Здоровье и тело", emoji: "🏥", description: "Здоровье, тело и медицина.",
    words: ["health","healthy","doctor","hospital","nurse","medicine","medical","illness","disease","pain","sick",
      "ill","body","head","hand","arm","leg","eye","ear","heart","blood","fever","cough","injury","injured","treatment",
      "treat","rest","sleep","surgeon","surgery","clinic","patient","pharmacy","pharmacist","prescription","symptom",
      "diagnosis","diagnose","virus","infection","infected","vaccine","vaccination","therapy","therapist","recovery",
      "recover","wound","bandage","ambulance","emergency","allergy","allergic","disability","disabled","obesity",
      "obese","fitness","nutrition","wellbeing","well-being","mental health","stress","anxiety","depression","fatigue",
      "exhausted","dizzy","nausea","chronic","acute","epidemic","pandemic","outbreak","immune","immunity","organ",
      "skeleton","bone","muscle","skin","nerve","brain","lung","liver","kidney","stomach","digestive","circulation",
      "breath","breathe","breathing","pulse","temperature","foot","mouth","nose","knee","neck","finger","shoulder",
      "chest","throat","toe","lip","cheek","elbow","wrist","skull","thumb","tissue","gut","vein","limb","hip","palm",
      "heel","nail"],
  },
  emotions_character: {
    title: "Эмоции и характер", emoji: "😊", description: "Чувства, настроение и черты характера.",
    words: ["happy","sad","angry","afraid","scared","surprised","excited","nervous","worried","calm",
      "proud","bored","tired","love","hate","like","enjoy","fear","hope","feel","feeling","emotion","emotional","mood",
      "smile","cry","laugh","kind","friendly","shy","brave","character","personality","honest","generous","selfish",
      "rude","polite","patient","patience","confident","confidence","friendship","friend","trust","respect","argument",
      "disagreement","apologize","apologise","forgive","support","understanding","loyal","loyalty","jealous","jealousy",
      "stubborn","sociable","reliable","ambitious","attitude","behaviour","behavior","temper","sensitive","arrogant",
      "humble","tolerant","independent","cooperate","cooperation","embarrass","embarrassed","frustrated","frustration",
      "anxious","depressed","optimistic","pessimistic","enthusiastic","enthusiasm","curious","curiosity","grateful",
      "gratitude","guilt","guilty","shame","ashamed","disappointed","disappointment","relief","relieved","satisfaction",
      "satisfied","comfort","comfortable","uncomfortable","insecure","secure","charming","charm","modest","vain",
      "compassion","compassionate","empathy","sympathy","sympathetic","psychology","psychological","motivation",
      "motivate","perception","awareness","interest","miss","worry","dream","habit"],
  },
  tech_media: {
    title: "Технологии и медиа", emoji: "💻", description: "Техника, интернет и медиа.",
    words: ["computer","internet","phone","mobile","email","website","app","software","password","screen",
      "keyboard","mouse","download","upload","online","digital","technology","technological","device","camera","video",
      "message","text","call","network","data","file","print","printer","robot","robotic","artificial","innovation",
      "innovative","media","journalism","journalist","press","broadcast","publish","publication","article","headline",
      "advertisement","propaganda","censorship","communication","interview","audience","coverage","blog","platform",
      "influencer","social media","gadget","hardware","battery","charger","wifi","bluetooth","browser","server",
      "database","code","coding","program","programmer","algorithm","artificial intelligence","virtual","satellite",
      "telephone","television","radio","machine","programme","laptop","tablet","smartphone","web","cable","monitor",
      "icon","input","output"],
  },
  money_shopping: {
    title: "Деньги и покупки", emoji: "💰", description: "Деньги, покупки и финансы.",
    words: ["money","price","cost","pay","payment","buy","sell","shop","shopping","store","market","bank",
      "cash","card","credit","expensive","cheap","free","bill","spend","budget","rich","poor","loan","currency","coin",
      "dollar","discount","sale","receipt","refund","purchase","afford","debt","savings","save","wallet","atm",
      "transaction","invoice","subscription","membership","voucher","coupon","cent","euro","pound","product","present",
      "pub","bar","auction"],
  },
  time_weather: {
    title: "Время и погода", emoji: "⏰", description: "Время, даты и погода.",
    words: ["time","day","week","month","year","hour","minute","second","today","tomorrow","yesterday","morning",
      "afternoon","evening","night","weekend","season","spring","summer","autumn","fall","winter","weather","rain",
      "rainy","snow","snowy","wind","windy","sunny","cloud","cloudy","cold","hot","warm","cool","temperature","storm",
      "thunder","lightning","fog","foggy","humidity","humid","forecast","climate","calendar","schedule","deadline",
      "century","decade","era","period","moment","frequently","recently","eventually","occasionally","gradually",
      "immediately","suddenly","meanwhile","nowadays","daily","weekly","monthly","annual","annually","punctual",
      "punctuality","overdue","upcoming","overnight","birthday","date","march","midnight","tonight","ice","umbrella",
      "quarter","future","still","next","late","forever","aluminium"],
  },
  clothes_appearance: {
    title: "Одежда и внешность", emoji: "👗", description: "Одежда, стиль и внешность.",
    words: ["clothes","clothing","shirt","trousers","pants","dress","skirt","shoe","shoes","hat","coat",
      "jacket","jeans","sock","socks","glove","gloves","scarf","belt","suit","tie","uniform","fashion","fashionable",
      "style","stylish","wear","wearing","outfit","appearance","beautiful","handsome","attractive","pretty","ugly",
      "tall","short","slim","fat","thin","overweight","hair","hairstyle","beard","moustache","makeup","cosmetic",
      "jewellery","jewelry","ring","necklace","bracelet","earring","brand","designer","tailor","fabric","cotton","wool",
      "silk","leather","textile","laundry","black","blue","brown","pink","purple","red","white","yellow","blonde",
      "curly","watch","model"],
  },
  communication_speech: {
    title: "Общение и речь", emoji: "💬", description: "Речь, общение и язык.",
    words: ["say","tell","speak","speaking","talk","talking","ask","answer","mention","explain",
      "explanation","describe","description","discuss","discussion","claim","state","statement","announce",
      "announcement","declare","respond","response","reply","communicate","communication","express","expression",
      "suggest","suggestion","complain","complaint","admit","deny","promise","apologize","apologise","thank","greet",
      "greeting","invite","invitation","conversation","dialogue","chat","gossip","whisper","shout","yell","argue",
      "debate","persuade","persuasion","convince","negotiate","interrupt","translate","translation","interpreter",
      "pronunciation","pronounce","vocabulary","grammar","language","accent","fluent","fluency","bilingual","letter",
      "note","message","rumour","rumor","comment","remark","quote","quotation","speech","lecture",
      "he","she","it","we","us","they","them","him","her","his","its","my","your","our","their","mine","yours",
      "theirs","ours","hers","himself","herself","itself","myself","yourself","yourselves","ourselves","themselves",
      "who","whom","whose","what","which","that","this","these","those","each other","one another","how","why",
      "when","where","hello","hi","hey","bye","yeah","yes","no","oh","oh dear","oh well","welcome","dear","meaning",
      "opinion","phrase","word","title","topic","question","name","post","share","spell","listen","meet","information",
      "instruction","introduction","narrative","script","summary","documentation","documentary","editorial","edit",
      "edition","editor","author","correspondence","correspondent","commentator","columnist","column","memo","memoir",
      "dictate","declaration","proclaim","testimony","transcript","hint","clue","gesture","nod","shrug","sigh",
      "glance","gaze","stare"],
  },
  actions_movement: {
    title: "Движение и действия", emoji: "🏃", description: "Действия, движение и процессы.",
    words: ["go","goes","going","went","gone","come","coming","came","move","moving","moved","walk","walking",
      "walked","run","running","ran","jump","jumping","jumped","stop","stopping","stopped","start","starting","started",
      "begin","beginning","began","finish","finishing","finished","end","ending","ended","continue","continuing",
      "continued","turn","turning","turned","fall","falling","fell","rise","rising","rose","climb","climbing","climbed",
      "push","pushing","pushed","pull","pulling","pulled","throw","throwing","threw","catch","catching","caught",
      "carry","carrying","carried","lift","lifting","lifted","drop","dropping","dropped","hold","holding","held",
      "take","taking","took","taken","bring","bringing","brought","send","sending","sent","put","putting","use","using",
      "used","make","making","made","do","doing","did","done","act","acting","acted","perform","performing","performed",
      "achieve","achieving","achieved","achievement","accomplish","accomplished","accomplishment","attempt","attempted",
      "try","trying","tried","manage","managing","managed","succeed","succeeding","succeeded","fail","failing","failed",
      "avoid","avoiding","avoided","escape","escaping","escaped","chase","chasing","chased","follow","following",
      "followed","lead","leading","led","guide","guiding","guided","reach","reaching","reached","arrive","arriving",
      "arrived","leave","leaving","left","enter","entering","entered","exit","exiting","exited","approach","approaching",
      "approached","depart","departing","departed","proceed","proceeding","proceeded","advance","advancing","advanced",
      "retreat","retreating","retreated","operate","operating","operated","function","functioning","functioned",
      "handle","handling","handled","control","controlling","controlled","conduct","conducting",
      "conducted","establish","establishing","established","create","creating","created","build","building","built",
      "construct","constructing","constructed","destroy","destroying","destroyed","break","breaking","broke","broken",
      "repair","repairing","repaired","fix","fixing","fixed","organize","organizing","organized","organise","arrange",
      "arranging","arranged","plan","planning","planned","prepare","preparing","prepared","provide","providing",
      "provided","supply","supplying","supplied","deliver","delivering","delivered","transport","transporting",
      "transported","transfer","transferring","transferred","exchange","exchanging","exchanged","replace","replacing",
      "replaced","remove","removing","removed","add","adding","added","reduce","reducing","reduced","increase",
      "increasing","increased","decrease","decreasing","decreased","change","changing","changed","develop","developing",
      "developed","development","grow","growing","grew","grown","growth","expand","expanding","expanded","expansion",
      "reject","rejecting","rejected","accept","accepting","accepted","refuse","refusing","refused","allow","allowing",
      "allowed","permit","permitting","permitted","forbid","forbidding","forbade","prevent","preventing","prevented",
      "cause","causing","caused","affect","affecting","affected","influence","influencing","influenced","impact",
      "produce","producing","produced","involve","involving","involved","involvement","participate",
      "participating","participated","participation","contribute","contributing","contributed","attend","attending",
      "attended","attendance","join","joining","joined","engage","engaging","engaged","engagement","interact",
      "interacting","interacted","interaction","react","reacting","reacted","reaction","support",
      "supporting","supported","supervise","supervising","supervised","supervisor","recruit","recruiting",
      "recruited","stabilize","stabilizing","stabilized"],
  },
  qualities_description: {
    title: "Качества и описания", emoji: "🔖", description: "Свойства, качества и описания предметов и понятий.",
    words: ["good","bad","big","small","large","little","long","short","high","low","new","old","young",
      "easy","difficult","hard","simple","complex","complicated","important","interesting","boring","beautiful","ugly",
      "clean","dirty","fast","slow","strong","weak","heavy","light","full","empty","open","closed","safe","dangerous",
      "normal","strange","special","common","rare","adequate","appropriate","suitable","sufficient","inadequate",
      "efficient","effective","reliable","accurate","precise","clear","obvious","subtle","nuanced","ambiguous",
      "plausible","reasonable","logical","rational","irrational","absurd","arbitrary","consistent","inconsistent",
      "coherent","valid","invalid","genuine","authentic","artificial","abstract","concrete","specific","general",
      "particular","typical","ordinary","extraordinary","exceptional","significant","insignificant","substantial",
      "minor","major","primary","secondary","essential","crucial","vital","optional","mandatory","flexible","rigid",
      "stable","unstable","permanent","temporary","constant","variable","dynamic","static","gradual","sudden",
      "immediate","instant","direct","indirect","explicit","implicit","inherent","intrinsic","relevant","irrelevant",
      "advanced","basic","thorough","rigorous","comprehensive","extensive","limited","broad","narrow",
      "deep","shallow","wide","tight","loose","firm","solid","fragile","durable","sophisticated","straightforward",
      "outstanding","remarkable","impressive","disappointing","annoying","relaxing","tempting","tedious","tricky",
      "spicy","tender","tough","fair","unfair","equal","unequal","similar","different","identical","distinct",
      "familiar","unfamiliar","aware","unaware","conscious","unconscious","capable","incapable","competent",
      "skilled","talented","gifted","brilliant","clever","intelligent","wise","foolish","naive","practical",
      "theoretical","realistic","idealistic","objective","subjective",
      "a bit","a lot","all","another","anyone","anything","anybody","almost","any more","all right","all about…",
      "all over…","all sorts of…","all kinds of…","a number of sth","again and again","as well","best","better",
      "both","but","by","cannot","complete","each","even","everybody","everyone","everything","extra","false",
      "fantastic","favourite","few","final","fine","first","five","fourth","funny","great","half","how","hundred",
      "if","in","include","into","many","most","need","nine","nineteen","ninety","no one","nobody","not","nothing",
      "now","of","off","one","only","opposite","or","order","other","out","over","part","perfect","piece","pink",
      "point","popular","positive","possible","pound","practice","quarter","quick","quiet","ready","red","result",
      "section","seven","seventeen","seventy","situation","six","sixty","so far","somebody","someone","something",
      "such","ten","that","them","then","there","they","thing","third","thirteen","thirty","this","thousand","three",
      "through","true","twelve","twenty","two","type","until","up","us","wait","way","we","when","where","which",
      "white","who","why","wrong","yourself","zero","eight","eighteen","eighty","eleven","fifteen","fifth","fifty",
      "forty","four","less","least","much better","one or two","quite a lot","quite a…","no more than…","no way",
      "not at all","not necessarily","not only","not even","far more","far too","exactly the same","instead of",
      "except for","in some cases","in the same way","in this way","up and down","difference","advantage",
      "disadvantage","alternative","amount","average","certain","chance","choice","condition","context","count",
      "cover","effect","factor","feature","level","matter","measure","method","option","possibility","process",
      "progress","proportion","quality","quantity","range","rate","role","scale","scope","standard","structure",
      "system","term","terms","value","variety","sort","sort of sth","such a…","the extent to which…"],
  },
  society_state: {
    title: "Общество и государство", emoji: "🏛️", description: "Общество, государство, право и политика.",
    words: ["society","social","community","poverty","inequality","crime","criminal","justice","law","legal",
      "illegal","government","governance","policy","politics","political","politician","protest","immigrant",
      "immigration","refugee","discrimination","homeless","homelessness","welfare","charity","volunteer","citizen",
      "citizenship","democracy","democratic","rights","human rights","equality","racism","gender","minority","activist",
      "reform","corruption","election","vote","voting","voter","parliament","senate","president","minister",
      "ambassador","diplomat","diplomatic","coalition","constitution","constitutional","jurisdiction","lawsuit",
      "legislation","legislative","prosecute","prosecution","referendum","regime","sanction","sovereignty","treaty",
      "tribunal","verdict","court","judge","jury","witness","evidence","trial","sentence","prison","police","officer",
      "authority","authorities","public","private","nation","national","international","global","globalization",
      "war","peace","military","army","soldier","weapon","conflict","terrorism","terrorist","revolution","independence",
      "colonial","empire","monarchy","republic","bureaucracy","taxpayer","policeman","group","world","rule","country"],
  },
  science_thinking: {
    title: "Наука и мышление", emoji: "🧠", description: "Мышление, рассуждение, наука и абстрактные понятия.",
    words: ["think","thinking","thought","believe","belief","consider","considering","considered",
      "decide","decision","doubt","wonder","realize","realise","assume","assumption","expect","expectation",
      "understand","understanding","know","knowledge","imagine","imagination","recognize","recognise","judge",
      "judgement","judgment","analyse","analyze","analysis","conclude","conclusion","argue","reason","reasoning",
      "science","scientific","scientist","research","researcher","experiment","experimental","laboratory","hypothesis",
      "theory","theoretical","discover","discovery","invent","invention","breakthrough","evidence","empirical",
      "methodology","validity","valid","correlation","contradiction","philosophy","philosophical","philosopher",
      "logic","logical","morality","moral","ethics","ethical","dilemma","premise","rational","contemplate","concept",
      "conceptual","notion","idea","physics","chemistry","biology","mathematics","calculate","calculation",
      "formula","equation","statistic","statistics","data","survey","questionnaire","sample","variable",
      "cognitive","cognition","intellect","intellectual","genius","curriculum","academic","academy",
      "object","number","problem","result","space","situation","type","point","form"],
  },
  art_culture: {
    title: "Искусство и культура", emoji: "🎨", description: "Искусство, литература, музыка и культура.",
    words: ["art","artist","artistic","paint","painting","painter","draw","drawing","sculpture","sculptor",
      "museum","gallery","exhibition","culture","cultural","tradition","traditional","literature","literary","novel",
      "novelist","poem","poetry","poet","author","writer","write","writing","book","story","fiction","nonfiction",
      "theatre","theater","drama","dramatic","actor","actress","play","performance","perform","concert","music",
      "musician","song","sing","singer","instrument","orchestra","dance","dancer","dancing","film","movie","cinema",
      "director","festival","ceremony","entertain","entertainment","leisure","talent","talented","aesthetic",
      "composition","critique","criticism","imagery","ironic","irony","manuscript","verse","masterpiece","heritage",
      "folklore","myth","legend","craft","craftsmanship","design","designer","architecture","architect",
      "photo","photograph","picture","piano","guitar","show","reader","read","magazine","comic","cartoon","drum",
      "album","lyric"],
  },
};

const THEME_ORDER = Object.keys(THEMES);
const KEYWORD_MAP = new Map<string, string>();
for (const [theme, def] of Object.entries(THEMES)) {
  for (const w of def.words) {
    const key = w.toLowerCase();
    if (!KEYWORD_MAP.has(key)) KEYWORD_MAP.set(key, theme);
  }
}

const COMMUNICATION_VERBS = new Set(["say","tell","speak","talk","ask","answer","mention","explain","describe",
  "discuss","claim","state","announce","declare","respond","reply","communicate","express","suggest","complain",
  "admit","deny","promise","apologize","apologise","thank","greet","invite","argue","debate","persuade","convince",
  "negotiate","translate","interrupt","whisper","shout","chat","comment","remark","warn","advise","recommend",
  "inform","report","confirm","request","demand","insist","object","propose"]);
const COGNITION_VERBS = new Set(["think","believe","consider","decide","doubt","wonder","realize","realise",
  "assume","expect","understand","know","imagine","recognize","recognise","judge","analyse","analyze","conclude",
  "reason","guess","suppose","estimate","predict","calculate","evaluate","interpret","perceive","notice","observe",
  "learn","remember","forget","recall","reflect","speculate","hypothesize"]);

function stripSuffix(word: string): string {
  return word.replace(/(ing|ed|es|s)$/i, "");
}

function classifyWord(en: string, pos: string, isPhrase: boolean): string {
  const key = en.toLowerCase().trim();
  if (KEYWORD_MAP.has(key)) return KEYWORD_MAP.get(key)!;

  if (isPhrase) {
    const tokens = key.split(/\s+/);
    for (const t of tokens) {
      const stripped = t.replace(/[.,…]/g, "");
      if (KEYWORD_MAP.has(stripped)) return KEYWORD_MAP.get(stripped)!;
    }
  } else {
    const stem = stripSuffix(key);
    if (stem !== key && KEYWORD_MAP.has(stem)) return KEYWORD_MAP.get(stem)!;
    for (const suffix of ["ing", "ed", "er", "or", "ion", "tion", "sion", "ment", "ness", "ity", "al", "ive", "ous", "ly"]) {
      if (key.endsWith(suffix)) {
        const base = key.slice(0, -suffix.length);
        if (KEYWORD_MAP.has(base)) return KEYWORD_MAP.get(base)!;
      }
    }
  }

  // POS-фолбэк — забирает основную массу абстрактных слов: движение/действия,
  // качества/описания, наука/мышление, общение/речь.
  if (pos === "adjective") return "qualities_description";
  if (pos === "adverb") return "qualities_description";
  if (pos === "numeral") return "qualities_description";
  if (pos === "pronoun" || pos === "preposition" || pos === "conjunction" || pos === "interjection") {
    return "communication_speech";
  }
  if (pos === "proper noun") return "society_state";
  if (pos === "modal verb") return "actions_movement";
  if (pos === "verb") {
    if (COMMUNICATION_VERBS.has(key)) return "communication_speech";
    if (COGNITION_VERBS.has(key)) return "science_thinking";
    return "actions_movement";
  }
  // noun (и всё прочее без явного POS): разбираем по суффиксу, чтобы не всё
  // абстрактное сваливалось в «наука и мышление» одним куском.
  if (/(ity|ness)$/.test(key)) return "qualities_description";
  if (/(ology|ography|onomy)$/.test(key)) return "science_thinking";
  if (/ism$/.test(key)) return "society_state";
  if (/ship$/.test(key)) return "society_state";
  if (/(tion|sion|ment)$/.test(key)) return "actions_movement";
  if (/(er|or|ist|ian|ant|ee)$/.test(key)) return "work_study";
  if (isPhrase) return "communication_speech";
  return "science_thinking";
}

// ── Сериализация в TS (совпадает с import-vocabulary.ts, включая фикс \n) ────
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

function serializeWord(w: SeedWord): string {
  const ru = w.ru.map((r) => `"${esc(r)}"`).join(", ");
  return `      { en: "${esc(w.en)}", pos: "${esc(w.pos)}", ru: [${ru}], ipa: "${esc(w.ipa)}", exEn: "${esc(w.exEn)}", exRu: "${esc(w.exRu)}", cefr: "${w.cefr}" },`;
}

function serializeDeck(d: SeedDeck): string {
  const words = d.words.map(serializeWord).join("\n");
  const cefr = d.cefrLevel ? `\n    cefrLevel: "${d.cefrLevel}",` : "";
  return `  {\n    theme: "${esc(d.theme)}",\n    title: "${esc(d.title)}",\n    emoji: "${esc(d.emoji)}",\n    description: "${esc(d.description)}",${cefr}\n    words: [\n${words}\n    ],\n  },`;
}

function serializeFile(level: string, decks: SeedDeck[]): string {
  const body = decks.map(serializeDeck).join("\n");
  return `// АВТОГЕНЕРИРОВАНО: scripts/src/reclassify-vocabulary.ts
// Слова взяты из уже импортированного датасета (import-vocabulary.ts), заново
// из сети НЕ качались — перераспределены по 20 осмысленным темам вместо
// колод «Топ-слова ${level.toUpperCase()} (N/M)».
import type { SeedDeck } from "./flashcards-data";

const decks: SeedDeck[] = [
${body}
];

export default decks;
`;
}

async function main() {
  const summary: Array<{ level: string; decks: number; words: number; misc: number }> = [];

  for (const level of LEVELS) {
    const file = path.join(DATA_DIR, `vocabulary-${level}.ts`);
    const fileUrl = `${pathToFileURL(file).href}?t=${Date.now()}`;
    const mod = await import(fileUrl);
    const oldDecks = mod.default as SeedDeck[];

    const allWords: SeedWord[] = [];
    for (const d of oldDecks) allWords.push(...d.words);

    const byTheme = new Map<string, SeedWord[]>();
    let miscCount = 0;
    for (const w of allWords) {
      const isPhrase = w.pos === "phrase" || /\s/.test(w.en.trim());
      const theme = classifyWord(w.en, w.pos, isPhrase);
      if (!THEME_ORDER.includes(theme)) {
        miscCount++;
        continue;
      }
      if (!byTheme.has(theme)) byTheme.set(theme, []);
      byTheme.get(theme)!.push(w);
    }

    // Разбиваем темы крупнее 60 слов на равные части по 30-60.
    const MAX_DECK_SIZE = 60;
    const finalDecks: SeedDeck[] = [];
    for (const themeKey of THEME_ORDER) {
      const words = byTheme.get(themeKey);
      if (!words || words.length === 0) continue;
      const def = THEMES[themeKey]!;
      const themeWithLevel = `${themeKey}_${level}`;
      if (words.length <= MAX_DECK_SIZE) {
        finalDecks.push({
          theme: themeWithLevel,
          title: def.title,
          emoji: def.emoji,
          description: def.description,
          cefrLevel: level.toUpperCase(),
          words,
        });
      } else {
        const parts = Math.ceil(words.length / MAX_DECK_SIZE);
        const chunkSize = Math.ceil(words.length / parts);
        for (let p = 0; p < parts; p++) {
          const chunkWords = words.slice(p * chunkSize, (p + 1) * chunkSize);
          if (chunkWords.length === 0) continue;
          finalDecks.push({
            theme: `${themeWithLevel}_${p + 1}`,
            title: `${def.title} ${level.toUpperCase()} (${p + 1}/${parts})`,
            emoji: def.emoji,
            description: def.description,
            cefrLevel: level.toUpperCase(),
            words: chunkWords,
          });
        }
      }
    }

    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(file, serializeFile(level, finalDecks), "utf-8");

    summary.push({ level: level.toUpperCase(), decks: finalDecks.length, words: allWords.length, misc: miscCount });
    console.log(`[${level.toUpperCase()}] ${finalDecks.length} колод, ${allWords.length} слов, misc=${miscCount}`);
  }

  console.log("\n| уровень | колод | слов | в «прочее» |");
  console.log("|---|---|---|---|");
  for (const s of summary) {
    console.log(`| ${s.level} | ${s.decks} | ${s.words} | ${s.misc} (${((s.misc / s.words) * 100).toFixed(1)}%) |`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

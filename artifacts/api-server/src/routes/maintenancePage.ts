// Разметка служебных страниц (см. routes/maintenance.ts).
//
// Одним куском, без сборки и внешних файлов: служебный инструмент не должен
// тянуть за собой ни фронтенд, ни его деплой. Держать разметку в файле с
// маршрутами тоже нельзя - сотня строк утопит в себе логику.
//
// Ключ доступа страницы берут из своего адреса и нигде не хранят: подставлять
// его в разметку на сервере нельзя, иначе он утечёт в кеш и историю браузера.
//
// Скрипты написаны без шаблонных строк: файл сам лежит внутри шаблонной
// строки, и вложенные обратные кавычки её бы закрыли. Атрибуты в разметке - в
// одинарных кавычках по той же причине.

const STYLE = [
  '*{box-sizing:border-box}',
  'body{margin:0;padding:16px 14px 40px;background:#f5f3ff;color:#1e1b3a;',
  'font:15px/1.45 -apple-system,BlinkMacSystemFont,Roboto,sans-serif}',
  'h1{font-size:21px;margin:0 0 4px;letter-spacing:-.4px}',
  '.sub{color:#6b628f;font-size:13px;margin-bottom:18px}',
  '.row{display:flex;gap:10px;margin-bottom:10px}',
  'input{flex:1;font:inherit;padding:13px 12px;border-radius:14px;',
  'border:1px solid #d6cdf3;background:#fff;color:#1e1b3a;min-width:0}',
  'button{flex:1;font:inherit;font-weight:700;color:#fff;background:#7c3aed;',
  'border:0;border-radius:14px;padding:14px 12px;box-shadow:0 4px 0 #4c1d95}',
  'button:active{transform:translateY(3px);box-shadow:0 1px 0 #4c1d95}',
  'button.ghost{background:#fff;color:#4c1d95;box-shadow:0 4px 0 #c9bdf0}',
  'button.stop{background:#e11d48;box-shadow:0 4px 0 #881337}',
  'button[disabled]{opacity:.45}',
  '.bar{height:10px;border-radius:6px;background:#ddd6fe;overflow:hidden;margin:14px 0 6px}',
  '.bar i{display:block;height:100%;width:0;background:#7c3aed;transition:width .3s}',
  '.stat{font-size:13px;color:#6b628f;margin:10px 0 14px}',
  '.item{background:#fff;border:1px solid #e6e0f8;border-left:4px solid #10b981;',
  'border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px}',
  '.item.idiom{border-left-color:#f59e0b}',
  '.pick{display:flex;gap:10px;align-items:flex-start}',
  '.pick input{flex:0 0 auto;width:22px;height:22px;margin:2px 0 0;padding:0}',
  '.deck{color:#8b7fb0;font-size:11px;text-transform:uppercase;letter-spacing:.6px}',
  '.w{font-weight:800;font-size:15px}',
  '.tr{color:#4c1d95;font-weight:700}',
  '.en{color:#1e1b3a;font-style:italic;margin-top:4px}',
  '.ru{color:#6b628f}',
  '.mark{color:#059669;font-size:11px;margin-top:3px}',
  '.empty{color:#8b7fb0;text-align:center;padding:24px 0}',
].join('');

function page(title: string, body: string, script: string): string {
  return [
    '<!doctype html><html lang=ru><head><meta charset=utf-8>',
    '<meta name=viewport content=\'width=device-width, initial-scale=1\'>',
    '<meta name=robots content=\'noindex, nofollow\'>',
    '<title>', title, '</title>',
    '<style>', STYLE, '</style></head><body>',
    body,
    '<script>', script, '</scr' + 'ipt>',
    '</body></html>',
  ].join('');
}

/** Экранирование: данные приходят извне и попадают в разметку. */
const ESC =
  "function esc(s){return String(s==null?'':s).split('&').join('&amp;').split('<').join('&lt;');}";

// ─────────────────────────────────────────────────────────────────────────────
// Конструктор фраз
// ─────────────────────────────────────────────────────────────────────────────
const PHRASES_SCRIPT = [
  "(function(){",
  "var key=new URLSearchParams(location.search).get('key')||'';",
  ESC,
  "var qEl=document.getElementById('q');",
  "var deckEl=document.getElementById('deck');",
  "var bFind=document.getElementById('find');",
  "var bAdd=document.getElementById('add');",
  "var stat=document.getElementById('stat');",
  "var list=document.getElementById('list');",
  "var found=[];",
  "function busy(on){bFind.disabled=on;bAdd.disabled=on||!found.length;}",
  // Карточка с галочкой. Фразы с записью носителя отмечаем заранее: в Tatoeba
  // озвучивают вычитанные предложения, то есть это ещё и признак качества.
  "function card(it,i,extra){",
  "var d=document.createElement('div');d.className='item'+(extra||'');",
  "var mark=it.hasAudio?'<div class=mark>есть запись носителя</div>':'';",
  "var ex=it.exampleEn?'<div class=en>'+esc(it.exampleEn)+'</div>'",
  "+'<div class=ru>'+esc(it.exampleRu||'')+'</div>':'';",
  "d.innerHTML='<label class=pick><input type=checkbox data-i='+i",
  "+(it.hasAudio?' checked':'')+'>'",
  "+'<span><span class=w>'+esc(it.en)+'</span>'",
  "+'<div class=tr>'+esc(it.ru)+'</div>'+ex+mark+'</span></label>';",
  "list.appendChild(d);}",
  "function idiomBlock(it){",
  "var d=document.createElement('div');d.className='item idiom';",
  "var syn=it.synonyms&&it.synonyms.length",
  "?'<div class=ru>то же, что: '+esc(it.synonyms.join(', '))+'</div>':'';",
  "var ex=it.exampleEn?'<div class=en>'+esc(it.exampleEn)+'</div>'",
  "+'<div class=ru>'+esc(it.exampleRu||'')+'</div>':'';",
  "d.innerHTML='<div class=deck>фразеологизм: значение, не дословно</div>'",
  "+'<div class=w>'+esc(it.phrase)+'</div>'",
  "+'<div class=tr>'+esc(it.meaningRu)+'</div>'",
  "+'<div class=ru>'+esc(it.meaning)+'</div>'+syn+ex;",
  "list.appendChild(d);}",
  "function find(){",
  "var q=qEl.value.trim();",
  "if(!q){stat.textContent='Введите слово или конструкцию.';return;}",
  "list.innerHTML='';found=[];busy(true);",
  "stat.textContent='Ищу живые фразы: '+q+'\\u2026';",
  "fetch('/api/maintenance/phrases/find?key='+encodeURIComponent(key)",
  "+'&q='+encodeURIComponent(q),{cache:'no-store'}).then(function(r){",
  "if(!r.ok)throw new Error('сервер ответил '+r.status);return r.json();",
  "}).then(function(d){",
  // Идиома идёт первой: у неё показывается значение, а не перевод фразы.
  "if(d.idiom){idiomBlock(d.idiom);",
  "found.push({en:d.idiom.phrase,ru:d.idiom.meaningRu,",
  "exampleEn:d.idiom.exampleEn,exampleRu:d.idiom.exampleRu,hasAudio:false});",
  "card(found[0],0,' idiom');}",
  "for(var i=0;i<d.phrases.length;i++){found.push(d.phrases[i]);",
  "card(d.phrases[i],found.length-1);}",
  "busy(false);",
  "if(!found.length){",
  "list.innerHTML='<div class=empty>Ничего не нашлось. Попробуй другое слово.</div>';",
  "stat.textContent='';return;}",
  "stat.textContent='Нашлось '+found.length+'. Отметь нужные и добавляй.';",
  "}).catch(function(e){stat.textContent='Ошибка: '+e.message;busy(false);});}",
  "function add(){",
  "var boxes=list.querySelectorAll('input[type=checkbox]');",
  "var picked=[];",
  "for(var i=0;i<boxes.length;i++){",
  "if(boxes[i].checked)picked.push(found[Number(boxes[i].getAttribute('data-i'))]);}",
  "if(!picked.length){stat.textContent='Ничего не отмечено.';return;}",
  "var deck=deckEl.value.trim();",
  "if(!deck){stat.textContent='Впиши название колоды.';return;}",
  "busy(true);stat.textContent='Добавляю '+picked.length+'\\u2026';",
  "fetch('/api/maintenance/phrases/add?key='+encodeURIComponent(key),{",
  "method:'POST',headers:{'Content-Type':'application/json'},",
  "body:JSON.stringify({deck:deck,cards:picked})}).then(function(r){",
  "if(!r.ok)throw new Error('сервер ответил '+r.status);return r.json();",
  "}).then(function(d){",
  "stat.textContent='Добавлено '+d.added+' в колоду '+d.deck",
  "+(d.skipped?', пропущено '+d.skipped+' (уже были)':'')+'.';",
  "list.innerHTML='';found=[];qEl.value='';busy(false);qEl.focus();",
  "}).catch(function(e){stat.textContent='Ошибка: '+e.message;busy(false);});}",
  "bFind.addEventListener('click',find);",
  "bAdd.addEventListener('click',add);",
  "qEl.addEventListener('keydown',function(e){if(e.key==='Enter')find();});",
  "busy(false);",
  "})();",
].join('');

const PHRASES_BODY = [
  '<h1>Колоды из фраз</h1>',
  '<div class=sub>Единица обучения - целая фраза, а не слово. У фразы одно',
  ' значение, поэтому неверного перевода тут быть не может: и английское',
  ' предложение, и русский перевод написаны людьми (Tatoeba).',
  ' Для устойчивых выражений отдельно показывается <b>значение</b> из',
  ' Викисловаря - дословного перевода идиом здесь нет нигде.</div>',
  '<div class=row><input id=q placeholder=\'слово или конструкция: can sing\'></div>',
  '<div class=row><input id=deck value=\'Фразы для разговора\'></div>',
  '<div class=row><button id=find>Найти</button>',
  '<button id=add class=ghost>Добавить</button></div>',
  '<div class=stat id=stat>Готов к работе.</div>',
  '<div id=list></div>',
].join('');

export const PHRASES_PAGE = page('Колоды из фраз', PHRASES_BODY, PHRASES_SCRIPT);

// ─────────────────────────────────────────────────────────────────────────────
// Примеры к словам старого каталога
// ─────────────────────────────────────────────────────────────────────────────
//
// Две вещи, без которых страница выглядит зависшей:
// 1. Обрыв запроса. Одна порция - это десятки обращений в сеть, до минуты.
//    Флаг «остановить», который проверяется только между порциями, для
//    человека равносилен неработающей кнопке. Поэтому AbortController.
// 2. Отчёт о том, что идёт прямо сейчас. Пока запрос в полёте, экран обязан
//    говорить об этом: иначе минута тишины читается как поломка.
const EXAMPLES_SCRIPT = [
  "(function(){",
  "var key=new URLSearchParams(location.search).get('key')||'';",
  ESC,
  "var busy=false,halt=false,ctrl=null;",
  "function ask(url){",
  "ctrl=new AbortController();",
  "return fetch(url,{cache:'no-store',signal:ctrl.signal}).then(function(r){",
  "if(!r.ok)throw new Error('сервер ответил '+r.status);return r.json();});}",
  "var bTest=document.getElementById('test');",
  "var bRun=document.getElementById('run');",
  "var bStop=document.getElementById('stop');",
  "var fill=document.getElementById('fill');",
  "var stat=document.getElementById('stat');",
  "var list=document.getElementById('list');",
  "function setBusy(on){busy=on;bTest.disabled=on;bRun.disabled=on;bStop.disabled=!on;}",
  "function add(it){",
  "var d=document.createElement('div');d.className='item';",
  "d.innerHTML='<div class=deck>'+esc(it.deck)+'</div>'",
  "+'<div class=w>'+esc(it.english)+' \\u2014 <span class=tr>'+esc(it.ru)+'</span></div>'",
  "+'<div class=en>'+esc(it.en)+'</div>'",
  "+'<div class=ru>'+esc(it.exampleRu)+'</div>';",
  "list.insertBefore(d,list.firstChild);}",
  "function run(dry){",
  "if(busy)return;",
  "list.innerHTML='';halt=false;setBusy(true);",
  "var after=0,seen=0,found=0,total=0;",
  "function step(){",
  "if(halt){stat.textContent='Остановлено. Просмотрено '+seen+', добавлено '+found+'.';",
  "setBusy(false);return;}",
  "stat.textContent='Проверяю слова '+(seen+1)+'\\u2013'+(seen+10)",
  "+(total?' из '+total:'')+'\\u2026 добавлено '+found;",
  "var url='/api/maintenance/fill-examples/batch?key='+encodeURIComponent(key)",
  "+'&after='+after+'&limit=10'+(dry?'&dry=1':'');",
  "ask(url).then(function(d){",
  "if(!total)total=d.remaining;",
  "for(var i=0;i<d.items.length;i++){add(d.items[i]);}",
  "found+=dry?d.items.length:d.filled;seen+=d.checked;",
  "fill.style.width=(total?Math.round(Math.min(seen,total)*100/total):100)+'%';",
  "if(dry){stat.textContent='Без примера сейчас: '+d.remaining",
  "+'. Для первых '+d.checked+' нашлось '+d.items.length+'.';setBusy(false);return;}",
  "if(d.nextAfter===null){setBusy(false);",
  "stat.textContent='Готово. Просмотрено '+seen+', добавлено примеров: '+found+'.';",
  "if(!found&&!list.firstChild)list.innerHTML='<div class=empty>Добавлять нечего.</div>';",
  "return;}",
  "after=d.nextAfter;setTimeout(step,150);",
  "}).catch(function(e){",
  "if(e&&e.name==='AbortError'){",
  "stat.textContent='Остановлено. Просмотрено '+seen+', добавлено '+found+'.';}",
  "else{stat.textContent='Ошибка: '+e.message+'. Добавлено: '+found+'.';}",
  "setBusy(false);});",
  "}",
  "step();}",
  "bTest.addEventListener('click',function(){run(true);});",
  "bRun.addEventListener('click',function(){run(false);});",
  "bStop.addEventListener('click',function(){halt=true;if(ctrl)ctrl.abort();});",
  "})();",
].join('');

const EXAMPLES_BODY = [
  '<h1>Примеры к словам</h1>',
  '<div class=sub>Заполняет пустые примеры у старых карточек-слов. Пример',
  ' берётся из Викисловаря и только из того значения, чей перевод совпал с',
  ' переводом карточки. Совпадения нет - карточка остаётся пустой.',
  ' <b>Существующие примеры и переводы не меняются.</b></div>',
  '<div class=row><button id=test class=ghost>Посмотреть</button>',
  '<button id=run>Заполнить</button></div>',
  '<div class=row><button id=stop class=stop disabled>Остановить</button></div>',
  '<div class=bar><i id=fill></i></div>',
  '<div class=stat id=stat>Готов к запуску.</div>',
  '<div id=list></div>',
].join('');

export const EXAMPLES_PAGE = page('Примеры к словам', EXAMPLES_BODY, EXAMPLES_SCRIPT);

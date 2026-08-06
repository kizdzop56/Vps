// Разметка служебной страницы «примеры употребления» (см. routes/maintenance.ts).
//
// Одним куском, без сборки и внешних файлов: служебный инструмент не должен
// тянуть за собой ни фронтенд, ни его деплой. Держать разметку в файле с
// маршрутами тоже нельзя - сотня строк утопит в себе логику.
//
// Ключ доступа страница берёт из своего адреса и нигде не хранит: подставлять
// его в разметку на сервере нельзя, иначе он утечёт в кеш и историю браузера.
//
// ── Две вещи, без которых страница выглядит зависшей ────────────────────────
// 1. Обрыв запроса. Одна порция - это десятки обращений в сеть, до минуты.
//    Флаг «остановить», который проверяется только между порциями, для
//    человека равносилен неработающей кнопке. Поэтому AbortController.
// 2. Отчёт о том, что идёт прямо сейчас. Пока запрос в полёте, экран обязан
//    говорить об этом: иначе минута тишины читается как поломка.
//
// Скрипт написан без шаблонных строк: файл сам лежит внутри шаблонной строки,
// и вложенные обратные кавычки её бы закрыли.

const STYLE = [
  '*{box-sizing:border-box}',
  'body{margin:0;padding:16px 14px 40px;background:#f5f3ff;color:#1e1b3a;',
  'font:15px/1.45 -apple-system,BlinkMacSystemFont,Roboto,sans-serif}',
  'h1{font-size:21px;margin:0 0 4px;letter-spacing:-.4px}',
  '.sub{color:#6b628f;font-size:13px;margin-bottom:18px}',
  '.row{display:flex;gap:10px;margin-bottom:10px}',
  'button{flex:1;font:inherit;font-weight:700;color:#fff;background:#7c3aed;',
  'border:0;border-radius:14px;padding:14px 12px;box-shadow:0 4px 0 #4c1d95}',
  'button:active{transform:translateY(3px);box-shadow:0 1px 0 #4c1d95}',
  'button.ghost{background:#fff;color:#4c1d95;box-shadow:0 4px 0 #c9bdf0}',
  'button.stop{background:#e11d48;box-shadow:0 4px 0 #881337}',
  'button[disabled]{opacity:.45}',
  '.bar{height:10px;border-radius:6px;background:#ddd6fe;overflow:hidden;margin:14px 0 6px}',
  '.bar i{display:block;height:100%;width:0;background:#7c3aed;transition:width .3s}',
  '.stat{font-size:13px;color:#6b628f;margin-bottom:14px}',
  '.item{background:#fff;border:1px solid #e6e0f8;border-left:4px solid #10b981;',
  'border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px}',
  '.deck{color:#8b7fb0;font-size:11px;text-transform:uppercase;letter-spacing:.6px}',
  '.w{font-weight:800;font-size:15px}',
  '.tr{color:#4c1d95;font-weight:700}',
  '.en{color:#1e1b3a;font-style:italic;margin-top:4px}',
  '.ru{color:#6b628f}',
  '.empty{color:#8b7fb0;text-align:center;padding:24px 0}',
].join("");

const SCRIPT = [
  "(function(){",
  "var key=new URLSearchParams(location.search).get('key')||'';",
  // Данные приходят из базы и попадают в разметку: без экранирования фраза с
  // угловой скобкой сломала бы страницу.
  "function esc(s){return String(s==null?'':s).split('&').join('&amp;').split('<').join('&lt;');}",
  "var busy=false,halt=false,ctrl=null;",
  // Запрос с обрывом: без AbortController кнопка «Остановить» ничего не делает
  // до конца текущей порции, а это до минуты.
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
  "+'<div class=w>'+esc(it.english)+' &mdash; <span class=tr>'+esc(it.ru)+'</span></div>'",
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
  // Пока запрос в полёте, экран обязан говорить, что он делает.
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
  "stat.textContent='Готово. Просмотрено '+seen+', добавлено примеров: '+found",
  "+'. У остальных слов в словаре нет примера для нужного значения.';",
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
].join("");

const BODY = [
  '<h1>Примеры употребления</h1>',
  '<div class=sub>Заполняет пустые примеры. Пример берётся из Викисловаря и',
  ' только из того значения, чей перевод совпал с переводом карточки: для',
  ' «tie = галстук» это будет фраза про галстук, а не про ничью.',
  ' Совпадения нет - карточка остаётся пустой.',
  ' <b>Существующие примеры и переводы не меняются.</b></div>',
  '<div class=row><button id=test class=ghost>Посмотреть</button>',
  '<button id=run>Заполнить</button></div>',
  '<div class=row><button id=stop class=stop disabled>Остановить</button></div>',
  '<div class=bar><i id=fill></i></div>',
  '<div class=stat id=stat>Готов к запуску.</div>',
  '<div id=list></div>',
].join("");

export const EXAMPLES_PAGE = [
  '<!doctype html><html lang=ru><head><meta charset=utf-8>',
  '<meta name=viewport content="width=device-width, initial-scale=1">',
  '<meta name=robots content="noindex, nofollow">',
  '<title>Примеры употребления</title>',
  '<style>', STYLE, '</style></head><body>',
  BODY,
  '<script>', SCRIPT, '</scr' + 'ipt>',
  '</body></html>',
].join("");

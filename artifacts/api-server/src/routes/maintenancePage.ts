// Разметка служебной страницы «примеры употребления» (см. routes/maintenance.ts).
//
// Одним куском, без сборки и внешних файлов: служебный инструмент не должен
// тянуть за собой ни фронтенд, ни его деплой. Держать разметку в файле с
// маршрутами тоже нельзя - сотня строк утопит в себе логику.
//
// Ключ доступа страница берёт из своего адреса и нигде не хранит: подставлять
// его в разметку на сервере нельзя, иначе он утечёт в кеш и историю браузера.
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
  'button[disabled]{opacity:.45}',
  '.bar{height:10px;border-radius:6px;background:#ddd6fe;overflow:hidden;margin:14px 0 6px}',
  '.bar i{display:block;height:100%;width:0;background:#7c3aed;transition:width .3s}',
  '.stat{font-size:13px;color:#6b628f;margin-bottom:14px}',
  '.item{background:#fff;border:1px solid #e6e0f8;border-left:4px solid #10b981;',
  'border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px}',
  '.deck{color:#8b7fb0;font-size:11px;text-transform:uppercase;letter-spacing:.6px}',
  '.w{font-weight:800;font-size:15px}',
  '.en{color:#1e1b3a;font-style:italic;margin-top:2px}',
  '.ru{color:#6b628f}',
  '.empty{color:#8b7fb0;text-align:center;padding:24px 0}',
].join("");

const SCRIPT = [
  "(function(){",
  "var key=new URLSearchParams(location.search).get('key')||'';",
  "var bTest=document.getElementById('test');",
  "var bRun=document.getElementById('run');",
  "var bStop=document.getElementById('stop');",
  "var fill=document.getElementById('fill');",
  "var stat=document.getElementById('stat');",
  "var list=document.getElementById('list');",
  "var busy=false,halt=false;",
  // Данные приходят из базы и попадают в разметку: без экранирования фраза с
  // угловой скобкой сломала бы страницу.
  "function esc(s){return String(s==null?'':s).split('&').join('&amp;').split('<').join('&lt;');}",
  "function add(it){",
  "var d=document.createElement('div');d.className='item';",
  "d.innerHTML='<div class=deck>'+esc(it.deck)+'</div>'",
  "+'<div class=w>'+esc(it.english)+'</div>'",
  "+'<div class=en>'+esc(it.en)+'</div>'",
  "+'<div class=ru>'+esc(it.ru)+'</div>';",
  "list.insertBefore(d,list.firstChild);}",
  "function setBusy(on){busy=on;bTest.disabled=on;bRun.disabled=on;bStop.disabled=!on;}",
  "function run(dry){",
  "if(busy)return;",
  "list.innerHTML='';halt=false;setBusy(true);",
  "var total=0,done=0,found=0;",
  "function step(){",
  "if(halt){stat.textContent='Остановлено. Добавлено примеров: '+found+'.';setBusy(false);return;}",
  "var url='/api/maintenance/fill-examples/batch?key='+encodeURIComponent(key)",
  "+'&limit=25'+(dry?'&dry=1':'');",
  "fetch(url,{cache:'no-store'}).then(function(r){",
  "if(!r.ok)throw new Error('сервер ответил '+r.status);return r.json();",
  "}).then(function(d){",
  "if(!total)total=d.remaining;",
  "for(var i=0;i<d.items.length;i++){add(d.items[i]);}",
  "found+=dry?d.items.length:d.filled;",
  "done+=d.checked;",
  "fill.style.width=(total?Math.round(Math.min(done,total)*100/total):100)+'%';",
  "if(dry){stat.textContent='Без примера сейчас: '+d.remaining",
  "+'. Для первых '+d.checked+' нашлось '+d.items.length+'.';setBusy(false);return;}",
  "stat.textContent='Осталось без примера: '+Math.max(0,d.remaining-d.filled)",
  "+', добавлено за прогон: '+found;",
  "if(d.done){setBusy(false);",
  "stat.textContent='Готово. Добавлено примеров: '+found",
  "+'. Для остальных слов в Tatoeba пары не нашлось.';",
  "if(!found&&!list.firstChild)list.innerHTML='<div class=empty>Добавлять нечего.</div>';",
  "return;}",
  "setTimeout(step,200);",
  "}).catch(function(e){",
  "stat.textContent='Ошибка: '+e.message+'. Добавлено: '+found+'.';setBusy(false);});",
  "}",
  "step();}",
  "bTest.addEventListener('click',function(){run(true);});",
  "bRun.addEventListener('click',function(){run(false);});",
  "bStop.addEventListener('click',function(){halt=true;});",
  "})();",
].join("");

const BODY = [
  '<h1>Примеры употребления</h1>',
  '<div class=sub>Заполняет пустые примеры парами из Tatoeba: и фраза,',
  ' и русский перевод написаны людьми. Существующие примеры и переводы',
  ' не меняются - только пустые места.</div>',
  '<div class=row><button id=test class=ghost>Посмотреть</button>',
  '<button id=run>Заполнить</button></div>',
  '<div class=row><button id=stop class=ghost disabled>Остановить</button></div>',
  '<div class=bar><i id=fill></i></div>',
  '<div class=stat id=stat>Готов к запуску.</div>',
  '<div id=list></div>',
].join("");

export const FILL_PAGE = [
  '<!doctype html><html lang=ru><head><meta charset=utf-8>',
  '<meta name=viewport content="width=device-width, initial-scale=1">',
  '<meta name=robots content="noindex, nofollow">',
  '<title>Примеры употребления</title>',
  '<style>', STYLE, '</style></head><body>',
  BODY,
  '<script>', SCRIPT, '</scr' + 'ipt>',
  '</body></html>',
].join("");

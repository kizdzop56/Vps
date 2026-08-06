// Разметка служебной страницы аудита словаря (см. routes/maintenance.ts).
//
// Одним куском, без сборки и внешних файлов: служебный инструмент не должен
// тянуть за собой ни фронтенд, ни его деплой. Держать это в файле с маршрутами
// тоже нельзя - сотня строк разметки утопит в себе саму логику.
//
// Ключ доступа страница берёт из своего адреса и нигде не хранит: подставлять
// его в разметку на сервере нельзя, иначе он утечёт в кеш и историю браузера.
// По той же причине здесь стоит noindex.
//
// Скрипт страницы намеренно написан без шаблонных строк: файл сам лежит внутри
// шаблонной строки, и вложенные обратные кавычки её бы закрыли.

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
  'button.warn{background:#e11d48;box-shadow:0 4px 0 #881337}',
  'button[disabled]{opacity:.45}',
  '.bar{height:10px;border-radius:6px;background:#ddd6fe;overflow:hidden;margin:14px 0 6px}',
  '.bar i{display:block;height:100%;width:0;background:#7c3aed;transition:width .2s}',
  '.stat{font-size:13px;color:#6b628f;margin-bottom:14px}',
  '.item{background:#fff;border:1px solid #e6e0f8;border-left-width:4px;',
  'border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:13px}',
  '.wrong{border-left-color:#e11d48}',
  '.reordered{border-left-color:#f59e0b}',
  '.example{border-left-color:#6366f1}',
  '.w{font-weight:800;font-size:15px}',
  '.deck{color:#8b7fb0;font-size:11px;text-transform:uppercase;letter-spacing:.6px}',
  '.was{color:#8b7fb0;text-decoration:line-through}',
  '.now{color:#4c1d95;font-weight:700}',
  '.empty{color:#8b7fb0;text-align:center;padding:24px 0}',
].join("");

const SCRIPT = [
  "(function(){",
  "var p=new URLSearchParams(location.search);",
  "var key=p.get('key')||'';",
  "var deck=p.get('deck')||'';",
  "var bCheck=document.getElementById('check');",
  "var bFix=document.getElementById('fix');",
  "var bStop=document.getElementById('stop');",
  "var fill=document.getElementById('fill');",
  "var stat=document.getElementById('stat');",
  "var list=document.getElementById('list');",
  "var busy=false,halt=false;",
  "var LABEL={wrong:'неверный перевод',reordered:'значение не первое',example:'пример без слова'};",
  // Данные приходят из базы и попадают в разметку: без экранирования слово с
  // угловой скобкой сломало бы страницу.
  "function esc(s){return String(s==null?'':s).split('&').join('&amp;').split('<').join('&lt;');}",
  "function add(it){",
  "var d=document.createElement('div');",
  "d.className='item '+it.kind;",
  "d.innerHTML='<div class=deck>'+esc(it.deck)+' - '+LABEL[it.kind]+'</div>'",
  "+'<div class=w>'+esc(it.english)+'</div>'",
  "+'<div class=was>'+esc(it.before)+'</div>'",
  "+'<div class=now>'+esc(it.after)+'</div>';",
  "list.appendChild(d);}",
  "function setBusy(on){busy=on;bCheck.disabled=on;bFix.disabled=on;bStop.disabled=!on;}",
  "function run(apply){",
  "if(busy)return;",
  "if(apply&&!confirm('Записать исправления в базу? Отменить будет нельзя.'))return;",
  "list.innerHTML='';halt=false;setBusy(true);",
  "var offset=0,found=0,fixed=0,missed=0;",
  "function step(){",
  "if(halt){stat.textContent='Остановлено на '+offset+'. Найдено: '+found+'.';setBusy(false);return;}",
  "var url='/api/maintenance/audit-words/batch?key='+encodeURIComponent(key)",
  "+'&offset='+offset+'&limit=40'+(apply?'&apply=1':'')",
  "+(deck?'&deck='+encodeURIComponent(deck):'');",
  "fetch(url,{cache:'no-store'}).then(function(r){",
  "if(!r.ok)throw new Error('сервер ответил '+r.status);return r.json();",
  "}).then(function(d){",
  "for(var i=0;i<d.items.length;i++){add(d.items[i]);found++;}",
  "fixed+=d.updated;missed+=d.skipped;",
  "var done=d.nextOffset===null?d.total:d.nextOffset;",
  "fill.style.width=(d.total?Math.round(done*100/d.total):100)+'%';",
  "var line='Проверено '+done+' из '+d.total+', найдено '+found;",
  "if(apply)line+=', исправлено '+fixed;",
  "if(missed)line+=', пропущено '+missed;",
  "stat.textContent=(d.nextOffset===null?'Готово. ':'')+line;",
  "if(d.nextOffset===null){setBusy(false);",
  "if(!found)list.innerHTML='<div class=empty>Расхождений не найдено.</div>';return;}",
  "offset=d.nextOffset;setTimeout(step,150);",
  "}).catch(function(e){",
  "stat.textContent='Ошибка: '+e.message+'. Остановились на '+offset+'.';setBusy(false);});",
  "}",
  "step();}",
  "bCheck.addEventListener('click',function(){run(false);});",
  "bFix.addEventListener('click',function(){run(true);});",
  "bStop.addEventListener('click',function(){halt=true;});",
  "})();",
].join("");

const BODY = [
  '<h1>Аудит словаря</h1>',
  '<div class=sub>Переводы и примеры в готовых колодах. Сначала отчёт, потом исправление.</div>',
  '<div class=row><button id=check>Проверить</button>',
  '<button id=fix class=warn>Исправить</button></div>',
  '<div class=row><button id=stop class=ghost disabled>Остановить</button></div>',
  '<div class=bar><i id=fill></i></div>',
  '<div class=stat id=stat>Готов к запуску.</div>',
  '<div id=list></div>',
].join("");

export const AUDIT_PAGE = [
  '<!doctype html><html lang=ru><head><meta charset=utf-8>',
  '<meta name=viewport content="width=device-width, initial-scale=1">',
  '<meta name=robots content="noindex, nofollow">',
  '<title>Аудит словаря</title>',
  '<style>', STYLE, '</style></head><body>',
  BODY,
  '<script>', SCRIPT, '</scr' + 'ipt>',
  '</body></html>',
].join("");

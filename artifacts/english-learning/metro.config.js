// Конфигурация Metro.
//
// ── Почему здесь настройки минификатора ─────────────────────────────────────
// По умолчанию минификатор переименовывает все функции в однобуквенные. React
// строит стек компонентов из `Component.displayName || Component.name`, и без
// имён этот стек превращается в столбец безымянных `span` и `div`:
//
//     span@unknown:0:0
//     @https://…/entry-17d808….js:1421:900
//     div@unknown:0:0
//
// По такому отчёту нельзя назвать даже экран, на котором всё упало. Консоли
// браузера на телефоне нет, воспроизвести на компьютере не всегда выходит —
// то есть отладка идёт вслепую, перебором.
//
// keep_fnames и keep_classnames возвращают в стек настоящие имена
// (MarathonScreen, WordTrainer, ChunkyButton). Цена — несколько процентов
// размера бандла; при бандле около мегабайта это незаметно, а один круг слепой
// отладки стоит вечера.
//
// Сама минификация остаётся включённой: локальные переменные сокращаются,
// мёртвый код вырезается. Не трогаются только имена функций и классов.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  minifierConfig: {
    ...(config.transformer.minifierConfig ?? {}),
    keep_classnames: true,
    keep_fnames: true,
    mangle: {
      ...(config.transformer.minifierConfig?.mangle ?? {}),
      keep_classnames: true,
      keep_fnames: true,
    },
  },
};

module.exports = config;

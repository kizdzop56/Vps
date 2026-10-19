import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

// This file is web-only and used to configure the root HTML for every
// web page during static rendering and dev.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/*
          Disable iOS Safari's automatic data detectors (phone numbers,
          addresses, dates, emails) that were turning plain UI text like
          "Витрина наград" into tap-to-open links (e.g. Apple/Google Maps).
        */}
        <meta
          name="format-detection"
          content="telephone=no, address=no, email=no, date=no"
        />

        {/* On the assignments page, hide only the 42px circular plus shortcut. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
          function hideCircularPlus(){
            if (!/\\/assignments\\/?$/.test(window.location.pathname)) return;
            document.querySelectorAll('svg path').forEach(function(path){
              var d = path.getAttribute('d') || '';
              if (d.indexOf('M12 5.4') === -1 || d.indexOf('M5.4 12') === -1) return;
              var node = path;
              while (node && node !== document.body) {
                var rect = node.getBoundingClientRect();
                var style = window.getComputedStyle(node);
                var radius = parseFloat(style.borderTopLeftRadius);
                if (Math.abs(rect.width - 42) < 2 && Math.abs(rect.height - 42) < 2 && Math.abs(radius - 21) < 2) {
                  var button = node.closest('[role="button"]');
                  (button || node).style.setProperty('display', 'none', 'important');
                  break;
                }
                node = node.parentElement;
              }
            });
          }
          hideCircularPlus();
          new MutationObserver(hideCircularPlus).observe(document.documentElement, { childList: true, subtree: true });
          window.addEventListener('load', hideCircularPlus);
          setInterval(hideCircularPlus, 500);
        })();` }} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

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

        {/* Hide only the round 42px button with the plus glyph; leave labeled buttons alone. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
          var plusPath = 'M12 5.4v13.2M5.4 12h13.2';
          function hideCircularPlus(){
            document.querySelectorAll('svg path[d="' + plusPath + '"]').forEach(function(path){
              var node = path;
              while (node && node !== document.body) {
                var style = window.getComputedStyle(node);
                var width = parseFloat(style.width);
                var height = parseFloat(style.height);
                var radius = parseFloat(style.borderTopLeftRadius);
                if (Math.abs(width - 42) < 1 && Math.abs(height - 42) < 1 && Math.abs(radius - 21) < 1) {
                  var button = node.closest('[role="button"]');
                  (button || node).style.display = 'none';
                  break;
                }
                node = node.parentElement;
              }
            });
          }
          hideCircularPlus();
          new MutationObserver(hideCircularPlus).observe(document.documentElement, { childList: true, subtree: true });
        })();` }} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

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

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

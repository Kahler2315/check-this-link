# Changelog

## 0.1.2 - 2026-07-29

- Treat websites under Google's official `.google` namespace, such as
  `about.google`, as legitimate rather than possible brand impersonation.
- Parse visible domains without mistaking common filenames, decimal numbers,
  versions, dates, or dotted prose for hostnames, and accept normal sentence
  punctuation around real domains.
- Compare common country-code and shared-hosting site boundaries more
  accurately.
- Match brand names at label/token boundaries, recognize selected Unicode
  lookalikes, and avoid substring false positives on legitimate service and
  infrastructure domains.
- Analyze rendered text, ARIA labels, image alternative text, and link titles.
- Rescan links after relevant DOM mutations, include open Shadow DOM roots, and
  inject the scanner into matching subframes and `about:blank`/`srcdoc` frames.

## 0.1.1 - 2026-07-28

- Isolate injected warning labels from webpage CSS with a closed Shadow DOM.
- Reset direction, writing mode, and transform properties so site styles cannot
  accidentally rotate or invert the label.
- Explicitly set the toolbar popup's text orientation.
- Correct the desktop Firefox minimum version from 142 to 140 while retaining
  142 as the separate Android minimum for the declared data-collection field.

## 0.1.0 - Recovered release

- Recover the exact runtime source and icons from the publicly distributed,
  Mozilla-signed XPI.

# Changelog

## 0.1.4 - 2026-07-29

- Recognize Microsoft Teams government-cloud hosts under `microsoft.us` and
  Microsoft's `.microsoft` namespace as official Microsoft destinations.
- Treat `aka.ms`, `microsoft.com`, `microsoft.us`, `.microsoft`, `office.com`,
  and `live.com` as related Microsoft-owned destination identities when
  comparing visible and actual domains.
- Unwrap only Microsoft's documented
  `*.safelinks.protection.outlook.com` links for local analysis, preventing
  legitimate email-security rewriting from causing mismatch warnings.
- Continue checking the embedded Safe Links destination for URL shorteners, IP
  addresses, misleading domains, and brand impersonation, and reject Safe Links
  lookalike hosts.
- Add 83 Teams, Microsoft-domain, Safe Links, and adversarial classification
  permutations. The expanded real-Firefox fixture now contains 56 cases.

## 0.1.3 - 2026-07-29

- Treat Reddit's canonical, short-link, media, and deep-link hosts as related
  destinations, avoiding mismatch warnings between `reddit.com`, `redd.it`,
  and the `reddit.app.link` tenant.
- Require a single visible domain to appear as a URL-like destination claim or
  follow a short navigation cue before reporting a mismatch. This avoids
  treating source domains inside headlines, discussions, or rich-card metadata
  as deceptive destinations.
- Preserve mismatch warnings for unrelated `app.link` tenants, domains that
  merely contain a Reddit hostname as a subdomain, pure visible-domain claims,
  and labels containing multiple conflicting domains.
- Add 85 Reddit and adversarial classification permutations plus a 33-case
  interactive Firefox regression fixture.

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

(function () {
  "use strict";

  const extensionApi = typeof browser !== "undefined" ? browser : chrome;
  const settingsHelpers = globalThis.CheckThisLinkSettings;
  const BADGE_TAG = "check-this-link-badge";
  const BADGE_ATTRIBUTE = "data-check-this-link-badge";
  const BADGE_HOST_STYLES = {
    all: "initial",
    display: "inline-block",
    "box-sizing": "border-box",
    "margin-inline-start": "0.35em",
    position: "static",
    transform: "none",
    rotate: "none",
    scale: "none",
    direction: "ltr",
    "writing-mode": "horizontal-tb",
    "text-orientation": "mixed",
    "unicode-bidi": "isolate",
    "vertical-align": "baseline",
    "pointer-events": "none"
  };
  const BADGE_SHADOW_STYLES = `
    :host {
      all: initial !important;
      display: inline-block !important;
      box-sizing: border-box !important;
      margin-inline-start: 0.35em !important;
      position: static !important;
      transform: none !important;
      rotate: none !important;
      scale: none !important;
      direction: ltr !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      unicode-bidi: isolate !important;
      vertical-align: baseline !important;
      pointer-events: none !important;
    }

    span {
      all: initial;
      display: inline-block;
      box-sizing: border-box;
      padding: 0.1em 0.35em;
      border: 1px solid #d92d20;
      border-radius: 4px;
      color: #8a1f14;
      background: #fff4f2;
      font: 600 11px/1.3 Arial, sans-serif;
      direction: ltr;
      writing-mode: horizontal-tb;
      text-orientation: mixed;
      unicode-bidi: isolate;
      transform: none;
      rotate: none;
      scale: none;
      white-space: nowrap;
    }
  `;

  const SHORTENER_HOSTS = new Set([
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "ow.ly",
    "buff.ly",
    "is.gd",
    "cutt.ly",
    "rebrand.ly",
    "shorturl.at",
    "s.id",
    "lnkd.in"
  ]);

  // Site boundaries come from the Public Suffix List tables in psl-data.js.
  // These are boundaries the list does not carry but that still hand out
  // independently controlled tenants, so two tenants must not collapse into one
  // apparent site. Keep this list short and only add a provider whose
  // subdomains are genuinely separate parties.
  const ADDITIONAL_PRIVATE_SUFFIXES = new Set([
    "app.link",
    "glitch.me",
    "neocities.org",
    "surge.sh",
    "tumblr.com",
    "weebly.com",
    "wordpress.com"
  ]);

  // Some services use a separate, first-party domain for short or deep links.
  // These groups are intentionally small: only domains that can safely be
  // treated as the same destination identity belong here.
  const RELATED_SITE_GROUPS = [
    new Set(["reddit.com", "redd.it", "reddit.app.link"]),
    new Set([
      "aka.ms",
      "live.com",
      "microsoft",
      "microsoft.com",
      "microsoft.us",
      "office.com"
    ])
  ];

  const MICROSOFT_SAFE_LINKS_SUFFIX = "safelinks.protection.outlook.com";

  // Dotted product names and filenames are common link text but are not useful
  // evidence that a link claims a different destination.
  const NON_DOMAIN_SUFFIXES = new Set([
    "css",
    "csv",
    "doc",
    "docx",
    "exe",
    "gif",
    "gz",
    "htm",
    "html",
    "iso",
    "jpeg",
    "jpg",
    "js",
    "json",
    "mp3",
    "mp4",
    "pdf",
    "png",
    "ppt",
    "pptx",
    "svg",
    "tar",
    "txt",
    "webp",
    "xls",
    "xlsx",
    "xml",
    "yaml",
    "yml"
  ]);

  const HIGH_RISK_BRAND_AFFIXES = new Set([
    "account",
    "auth",
    "billing",
    "careers",
    "login",
    "secure",
    "security",
    "signin",
    "support",
    "verify"
  ]);

  const CONFUSABLE_CHARACTERS = {
    "\u03b1": "a",
    "\u03bf": "o",
    "\u03c1": "p",
    "\u03c5": "y",
    "\u0430": "a",
    "\u0435": "e",
    "\u043e": "o",
    "\u0440": "p",
    "\u0441": "c",
    "\u0443": "y",
    "\u0445": "x",
    "\u0455": "s",
    "\u0456": "i",
    "\u0458": "j",
    "\u04bb": "h",
    "\u04cf": "l",
    "\u0501": "d",
    "\u051b": "q",
    "\u051d": "w"
  };

  const BRANDS = [
    { name: "google", domains: ["google.com", "google", "gmail.com"] },
    {
      name: "microsoft",
      domains: [
        "microsoft.com",
        "microsoft.us",
        "microsoft",
        "office.com",
        "live.com"
      ]
    },
    { name: "apple", domains: ["apple.com"] },
    { name: "amazon", domains: ["amazon.com"] },
    { name: "paypal", domains: ["paypal.com"] },
    { name: "netflix", domains: ["netflix.com"] },
    { name: "facebook", domains: ["facebook.com", "fb.com"] },
    { name: "instagram", domains: ["instagram.com"] },
    { name: "linkedin", domains: ["linkedin.com"] },
    { name: "github", domains: ["github.com", "github.io"] }
  ];

  let lastScan = {
    enabled: true,
    totalLinks: 0,
    suspiciousLinks: 0,
    reasons: {}
  };
  let userSettings = settingsHelpers.sanitizeSettings(
    settingsHelpers.DEFAULT_SETTINGS
  );

  function normalizeHost(hostname) {
    return hostname
      .toLowerCase()
      .replace(/\.+$/, "")
      .replace(/^www\./, "");
  }

  function isSameOrSubdomain(hostname, domain) {
    return hostname === domain || hostname.endsWith("." + domain);
  }

  function matchesSuffixRule(table, rule) {
    return table.includes("\n" + rule + "\n");
  }

  // The suffix tables hold ACE labels, and URL.hostname is already ACE, but a
  // domain read out of visible link text can be Unicode. Both forms have to
  // canonicalize the same way or an internationalized suffix silently fails to
  // match and two separate sites collapse into one identity.
  function toAsciiHost(hostname) {
    if (!/[^\x00-\x7F]/.test(hostname)) {
      return hostname;
    }

    try {
      const encoded = new URL("https://" + hostname).hostname;
      return encoded || hostname;
    } catch (_error) {
      return hostname;
    }
  }

  // Public Suffix List algorithm, returning how many trailing labels form the
  // public suffix. An exception rule wins outright and shortens the suffix by
  // one label; otherwise the longest matching rule wins. A host that matches no
  // rule falls back to a single-label suffix, which is why psl-data.js can omit
  // single-label rules entirely.
  function getPublicSuffixLabelCount(labels) {
    for (let index = 0; index < labels.length; index += 1) {
      const candidate = labels.slice(index).join(".");
      if (matchesSuffixRule(ICANN_SUFFIX_RULES, "!" + candidate)) {
        return labels.length - index - 1;
      }
      if (matchesSuffixRule(PRIVATE_SUFFIX_RULES, "!" + candidate)) {
        return labels.length - index - 1;
      }
    }

    for (let index = 0; index < labels.length; index += 1) {
      const candidate = labels.slice(index).join(".");
      const wildcard = ["*", ...labels.slice(index + 1)].join(".");

      const matched =
        matchesSuffixRule(ICANN_SUFFIX_RULES, candidate) ||
        matchesSuffixRule(PRIVATE_SUFFIX_RULES, candidate) ||
        matchesSuffixRule(ICANN_SUFFIX_RULES, wildcard) ||
        matchesSuffixRule(PRIVATE_SUFFIX_RULES, wildcard) ||
        ADDITIONAL_PRIVATE_SUFFIXES.has(candidate);

      if (matched) {
        return labels.length - index;
      }
    }

    return 1;
  }

  // Returns the shared-hosting boundary a host sits under, or undefined for an
  // ordinary registry domain. Only private-section boundaries count: "com" and
  // "co.uk" are registries rather than hosting providers, so treating them as
  // shared hosting would break the brand-impersonation checks.
  function getSharedHostingSuffix(hostname) {
    const host = normalizeHost(hostname);
    const labels = host.split(".").filter(Boolean);
    const asciiLabels = toAsciiHost(host).split(".").filter(Boolean);

    // ACE encoding maps one label to one label, so the ASCII form can decide
    // the match while the suffix is sliced from the caller's own form. The
    // brand-impersonation check measures this string against the host it
    // passed in, and it needs the original characters to spot confusables.
    if (asciiLabels.length !== labels.length) {
      return undefined;
    }

    for (let index = 0; index < labels.length; index += 1) {
      const candidate = asciiLabels.slice(index).join(".");
      const wildcard = ["*", ...asciiLabels.slice(index + 1)].join(".");

      if (
        matchesSuffixRule(PRIVATE_SUFFIX_RULES, candidate) ||
        matchesSuffixRule(PRIVATE_SUFFIX_RULES, wildcard) ||
        ADDITIONAL_PRIVATE_SUFFIXES.has(candidate)
      ) {
        return labels.slice(index).join(".");
      }
    }

    return undefined;
  }

  function isS3BucketHost(host) {
    const labels = host.split(".");
    if (labels.slice(-2).join(".") !== "amazonaws.com") {
      return false;
    }

    // A bucket name sits in front of the s3 endpoint label. Index 0 means the
    // host is the bare endpoint, which is path-style rather than a bucket host.
    return labels.findIndex(
      (label) => label === "s3" || label.startsWith("s3-")
    ) > 0;
  }

  function getSimpleBaseDomain(hostname) {
    // Canonicalized to ACE so a visible domain written in Unicode and a
    // destination reported by URL.hostname resolve to the same identity, and so
    // the suffix tables can be matched at all.
    const host = toAsciiHost(normalizeHost(hostname));
    if (isIpAddress(host)) {
      return host;
    }

    const parts = host.split(".").filter(Boolean);
    if (parts.length <= 2) {
      return parts.join(".");
    }

    // S3 bucket names may contain dots, so the entire bucket-qualified host is
    // the tenant boundary rather than only the label above the suffix. The
    // regional s3-website-* endpoints are also not all listed publicly.
    if (isS3BucketHost(host)) {
      return host;
    }

    const suffixLength = getPublicSuffixLabelCount(parts);
    if (suffixLength >= parts.length) {
      return parts.join(".");
    }

    return parts.slice(-(suffixLength + 1)).join(".");
  }

  function getS3PathStyleIdentity(url) {
    const host = normalizeHost(url.hostname);
    const labels = host.split(".");
    if (
      labels.slice(-2).join(".") !== "amazonaws.com" ||
      !(labels[0] === "s3" || labels[0].startsWith("s3-"))
    ) {
      return null;
    }

    const bucket = url.pathname.split("/").find(Boolean);
    return bucket ? normalizeHost(bucket) + "." + host : null;
  }

  function getUrlSiteIdentity(url) {
    return getS3PathStyleIdentity(url) || getSimpleBaseDomain(url.hostname);
  }

  function getUrl(anchor) {
    try {
      return new URL(anchor.href);
    } catch (_error) {
      return null;
    }
  }

  function getEffectiveUrl(url) {
    let effectiveUrl = url;

    // Microsoft Safe Links stores the original destination in its `url`
    // parameter. Unwrap only the documented Microsoft-controlled hostname,
    // and keep analyzing the embedded URL so the wrapper cannot hide an IP,
    // shortener, lookalike, or genuinely mismatched destination.
    for (let depth = 0; depth < 3; depth += 1) {
      const host = normalizeHost(effectiveUrl.hostname);
      if (!isSameOrSubdomain(host, MICROSOFT_SAFE_LINKS_SUFFIX)) {
        break;
      }

      const wrappedDestination = effectiveUrl.searchParams.get("url");
      if (!wrappedDestination) {
        break;
      }

      try {
        const candidate = new URL(wrappedDestination);
        if (!["http:", "https:"].includes(candidate.protocol)) {
          break;
        }
        effectiveUrl = candidate;
      } catch (_error) {
        break;
      }
    }

    return effectiveUrl;
  }

  function isIpAddress(hostname) {
    const host = hostname.replace(/^\[/, "").replace(/\]$/, "");
    const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
    if (ipv4) {
      return host.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
    }

    return host.includes(":") && /^[0-9a-f:.]+$/i.test(host);
  }

  function isPlausibleVisibleHost(hostname) {
    const host = normalizeHost(hostname);
    if (isIpAddress(host)) {
      return true;
    }

    const parts = host.split(".").filter(Boolean);
    if (parts.length < 2) {
      return false;
    }

    const topLevel = parts.at(-1);
    if (
      NON_DOMAIN_SUFFIXES.has(topLevel) ||
      !/^(?:[a-z\u0080-\uffff]{2,63}|xn--[a-z0-9-]{1,59}|test)$/i.test(topLevel)
    ) {
      return false;
    }

    const singleLetterLabels = parts
      .slice(0, -1)
      .filter((part) => /^[a-z]$/i.test(part));
    return singleLetterLabels.length < 2;
  }

  function findVisibleDomains(text) {
    const domainPattern =
      /(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9\u0080-\uffff](?:[a-z0-9\u0080-\uffff-]{0,61}[a-z0-9\u0080-\uffff])?\.)+[a-z0-9\u0080-\uffff](?:[a-z0-9\u0080-\uffff-]{0,61}[a-z0-9\u0080-\uffff])?)(?::\d{1,5})?(?=[/?#\s,.;!?)\]}:'"»]|$)/gi;
    const candidateText = text.trim();
    const matches = [];

    for (const match of candidateText.matchAll(domainPattern)) {
      const host = normalizeHost(match[1]);
      if (isPlausibleVisibleHost(host)) {
        matches.push({
          host,
          index: match.index,
          raw: match[0]
        });
        // Callers need the first match and only whether a second exists.
        // Stop before hostile labels can force unbounded result allocation.
        if (matches.length === 2) {
          break;
        }
      }
    }

    return { candidateText, matches };
  }

  function isSimpleDestinationClaim(candidateText, match) {
    const prefix = candidateText.slice(0, match.index);
    const suffix = candidateText.slice(match.index + match.raw.length);
    const wrapperOnlyPrefix = /^[\s([{"'“‘]*$/u.test(prefix);
    const destinationCuePrefix =
      /^[\s([{"'“‘]*(?:open|visit|go(?:\s+to)?|browse(?:\s+to)?|continue(?:\s+to)?|read(?:\s+(?:at|on))?|sign\s+in(?:\s+(?:to|at))?|log\s+in(?:\s+(?:to|at))?|secure\s+(?:login|sign\s+in)(?:\s+(?:to|at))?|access(?:\s+(?:your\s+)?account)?(?:\s+(?:at|on))?|website|link)\s*[:\-–—]?\s*$/iu.test(
        prefix
      );
    const wrapperOnlySuffix = /^[\s)\]}"'”’».,;!?]*$/u.test(suffix);
    const urlSuffix =
      /^[/?#][^\s]*[\s)\]}"'”’».,;!?]*$/u.test(suffix);

    return (
      (wrapperOnlyPrefix || destinationCuePrefix) &&
      (wrapperOnlySuffix || urlSuffix)
    );
  }

  function extractClaimedVisibleSite(text) {
    const { candidateText, matches } = findVisibleDomains(text);
    if (matches.length === 0) {
      return null;
    }

    let selectedMatch;

    // Multiple domains in one label can explicitly claim one destination and
    // then point somewhere else. Keep checking the first one in that case.
    if (matches.length > 1) {
      selectedMatch = matches[0];
    } else if (isSimpleDestinationClaim(candidateText, matches[0])) {
      selectedMatch = matches[0];
    } else {
      return null;
    }

    if (/^https?:\/\//i.test(selectedMatch.raw)) {
      const suffix = candidateText.slice(
        selectedMatch.index + selectedMatch.raw.length
      );
      const claimedUrlText = (selectedMatch.raw + suffix).replace(
        /[\s)\]}"'”’».,;!?]+$/u,
        ""
      );
      try {
        const claimedUrl = new URL(claimedUrlText);
        const s3Identity = getS3PathStyleIdentity(claimedUrl);
        if (s3Identity) {
          return s3Identity;
        }
      } catch {
        // Fall back to the already-validated visible host.
      }
    }

    return getSimpleBaseDomain(selectedMatch.host);
  }

  function getPresentedLinkTexts(anchor) {
    const texts = [];
    const renderedText =
      typeof anchor.innerText === "string"
        ? anchor.innerText
        : anchor.textContent || "";

    if (renderedText.trim()) {
      texts.push(renderedText);
    }

    for (const attribute of ["aria-label", "title"]) {
      const value = anchor.getAttribute(attribute);
      if (value && value.trim()) {
        texts.push(value);
      }
    }

    if (typeof anchor.querySelectorAll === "function") {
      anchor.querySelectorAll("img[alt]").forEach((image) => {
        const alt = image.getAttribute("alt");
        if (alt && alt.trim()) {
          texts.push(alt);
        }
      });
    }

    return texts;
  }

  function isRelatedSite(leftBaseDomain, rightBaseDomain) {
    return RELATED_SITE_GROUPS.some((group) => {
      const domains = Array.from(group);
      const includesLeft = domains.some((domain) =>
        isSameOrSubdomain(leftBaseDomain, domain)
      );
      const includesRight = domains.some((domain) =>
        isSameOrSubdomain(rightBaseDomain, domain)
      );
      return includesLeft && includesRight;
    });
  }

  function hasMismatchedVisibleDomain(anchor, targetUrl) {
    const targetSiteIdentity = getUrlSiteIdentity(targetUrl);

    return getPresentedLinkTexts(anchor).some((text) => {
      const visibleSiteIdentity = extractClaimedVisibleSite(text);
      return (
        visibleSiteIdentity &&
        visibleSiteIdentity !== targetSiteIdentity &&
        !isRelatedSite(visibleSiteIdentity, targetSiteIdentity)
      );
    });
  }

  function decodePunycode(input) {
    const base = 36;
    const initialN = 128;
    const initialBias = 72;
    const delimiter = "-";
    const output = [];
    let index = 0;
    let n = initialN;
    let bias = initialBias;
    let i = 0;

    function decodeDigit(codePoint) {
      if (codePoint >= 48 && codePoint <= 57) {
        return codePoint - 22;
      }
      if (codePoint >= 65 && codePoint <= 90) {
        return codePoint - 65;
      }
      if (codePoint >= 97 && codePoint <= 122) {
        return codePoint - 97;
      }
      return base;
    }

    function adapt(delta, pointCount, firstTime) {
      let value = firstTime ? Math.floor(delta / 700) : delta >> 1;
      value += Math.floor(value / pointCount);
      let k = 0;

      while (value > 455) {
        value = Math.floor(value / 35);
        k += base;
      }

      return k + Math.floor((36 * value) / (value + 38));
    }

    const basicEnd = input.lastIndexOf(delimiter);
    if (basicEnd >= 0) {
      for (let position = 0; position < basicEnd; position += 1) {
        output.push(input.charCodeAt(position));
      }
      index = basicEnd + 1;
    }

    while (index < input.length) {
      const oldI = i;
      let weight = 1;

      for (let k = base; ; k += base) {
        if (index >= input.length) {
          throw new Error("Invalid Punycode label");
        }

        const digit = decodeDigit(input.charCodeAt(index));
        index += 1;
        if (digit >= base) {
          throw new Error("Invalid Punycode digit");
        }

        i += digit * weight;
        const threshold =
          k <= bias + 1 ? 1 : k >= bias + 26 ? 26 : k - bias;
        if (digit < threshold) {
          break;
        }
        weight *= base - threshold;
      }

      const outputLength = output.length + 1;
      bias = adapt(i - oldI, outputLength, oldI === 0);
      n += Math.floor(i / outputLength);
      i %= outputLength;
      output.splice(i, 0, n);
      i += 1;
    }

    return String.fromCodePoint(...output);
  }

  function decodeHostname(hostname) {
    return normalizeHost(hostname)
      .split(".")
      .map((label) => {
        if (!label.startsWith("xn--")) {
          return label;
        }

        try {
          return decodePunycode(label.slice(4));
        } catch (_error) {
          return label;
        }
      })
      .join(".");
  }

  function getConfusableSkeleton(value) {
    return Array.from(value.normalize("NFKD").toLowerCase())
      .map((character) => CONFUSABLE_CHARACTERS[character] || character)
      .join("")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function labelUsesBrand(label, brandName) {
    const skeleton = getConfusableSkeleton(label);
    const tokens = skeleton.split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.includes(brandName)) {
      return true;
    }

    return Array.from(HIGH_RISK_BRAND_AFFIXES).some(
      (affix) =>
        skeleton === brandName + affix ||
        skeleton === affix + brandName
    );
  }

  function hasBrandImpersonation(hostname) {
    const host = normalizeHost(hostname);
    const decodedLabels = decodeHostname(host).split(".");
    const sharedSuffix = getSharedHostingSuffix(host);
    const labelsToCheck =
      sharedSuffix && host !== sharedSuffix
        ? decodeHostname(
            host.slice(0, -(sharedSuffix.length + 1))
          ).split(".")
        : decodedLabels;

    return BRANDS.some((brand) => {
      const isOfficial = brand.domains.some(
        (domain) =>
          isSameOrSubdomain(host, domain) &&
          (!sharedSuffix || host === domain)
      );
      if (isOfficial) {
        return false;
      }

      return labelsToCheck.some((label) => labelUsesBrand(label, brand.name));
    });
  }

  function getSuspiciousReasons(anchor) {
    const anchorUrl = getUrl(anchor);
    if (!anchorUrl || !["http:", "https:"].includes(anchorUrl.protocol)) {
      return [];
    }

    const normalizedLink = settingsHelpers.normalizeLink(anchorUrl.href);
    if (userSettings.falsePositiveLinks.includes(normalizedLink)) {
      return [];
    }

    const url = getEffectiveUrl(anchorUrl);
    const host = normalizeHost(url.hostname);
    const reasons = [];

    if (
      Array.from(SHORTENER_HOSTS).some((shortener) =>
        isSameOrSubdomain(host, shortener)
      )
    ) {
      reasons.push("URL shortener");
    }

    if (isIpAddress(url.hostname)) {
      reasons.push("IP address link");
    }

    if (hasMismatchedVisibleDomain(anchor, url)) {
      reasons.push("visible domain mismatch");
    }

    if (hasBrandImpersonation(host)) {
      reasons.push("possible brand impersonation");
    }

    if (userSettings.falseNegativeLinks.includes(normalizedLink)) {
      reasons.unshift("manually flagged link");
    }

    return reasons;
  }

  function clearCheckThisLinkMarks(anchor) {
    anchor.classList.remove("linkguard-suspicious-link");
    anchor.removeAttribute("data-linkguard-reasons");

    if (anchor.hasAttribute("data-linkguard-original-title")) {
      const originalTitle = anchor.getAttribute("data-linkguard-original-title");
      if (originalTitle) {
        anchor.title = originalTitle;
      } else {
        anchor.removeAttribute("title");
      }
      anchor.removeAttribute("data-linkguard-original-title");
    }

    const badge = anchor.querySelector(
      `:scope > ${BADGE_TAG}[${BADGE_ATTRIBUTE}]`
    );
    if (badge) {
      badge.remove();
    }
  }

  function createBadge() {
    const badgeHost = document.createElement(BADGE_TAG);
    badgeHost.setAttribute(BADGE_ATTRIBUTE, "");
    badgeHost.setAttribute("aria-hidden", "true");

    Object.entries(BADGE_HOST_STYLES).forEach(([property, value]) => {
      badgeHost.style.setProperty(property, value, "important");
    });

    const shadowRoot = badgeHost.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    const label = document.createElement("span");

    style.textContent = BADGE_SHADOW_STYLES;
    label.textContent = "Link Hound";
    shadowRoot.append(style, label);

    return badgeHost;
  }

  function markSuspicious(anchor, reasons) {
    anchor.setAttribute("data-linkguard-original-title", anchor.getAttribute("title") || "");
    anchor.classList.add("linkguard-suspicious-link");
    anchor.setAttribute("data-linkguard-reasons", reasons.join(", "));
    anchor.title = anchor.title
      ? anchor.title + " | Link Hound: " + reasons.join(", ")
      : "Link Hound: " + reasons.join(", ");

    if (!anchor.querySelector(`:scope > ${BADGE_TAG}[${BADGE_ATTRIBUTE}]`)) {
      anchor.appendChild(createBadge());
    }
  }

  function getScanRoots() {
    const roots = [document];
    const pending = [document];

    while (pending.length > 0) {
      const root = pending.shift();
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot) {
          roots.push(element.shadowRoot);
          pending.push(element.shadowRoot);
        }
      });
    }

    return roots;
  }

  function getScannableAnchors() {
    const anchors = new Set();
    getScanRoots().forEach((root) => {
      root.querySelectorAll("a[href]").forEach((anchor) => anchors.add(anchor));
    });
    return Array.from(anchors);
  }

  let linkObserver = null;
  let rescanTimer = null;

  function observeScanRoots() {
    if (!linkObserver) {
      return;
    }

    linkObserver.disconnect();
    getScanRoots().forEach((root) => {
      linkObserver.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href", "title", "aria-label", "alt"]
      });
    });
  }

  function scanLinks() {
    if (linkObserver) {
      linkObserver.disconnect();
    }

    const anchors = getScannableAnchors();
    const summary = {
      enabled: userSettings.enabled,
      totalLinks: anchors.length,
      suspiciousLinks: 0,
      reasons: {}
    };

    anchors.forEach((anchor) => {
      clearCheckThisLinkMarks(anchor);

      if (!userSettings.enabled) {
        return;
      }

      const reasons = getSuspiciousReasons(anchor);
      if (reasons.length === 0) {
        return;
      }

      summary.suspiciousLinks += 1;
      reasons.forEach((reason) => {
        summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
      });

      markSuspicious(anchor, reasons);
    });

    lastScan = summary;
    observeScanRoots();
    return summary;
  }

  function nodeContainsLink(node) {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      (node.matches("a[href]") ||
        node.querySelector("a[href]") ||
        node.shadowRoot)
    );
  }

  function mutationTouchesLink(mutation) {
    if (mutation.type === "attributes") {
      return (
        mutation.target.matches("a[href]") ||
        Boolean(mutation.target.closest("a[href]"))
      );
    }

    if (mutation.type === "characterData") {
      return Boolean(
        mutation.target.parentElement &&
        mutation.target.parentElement.closest("a[href]")
      );
    }

    if (
      mutation.target.nodeType === Node.ELEMENT_NODE &&
      mutation.target.closest("a[href]")
    ) {
      return true;
    }

    return [...mutation.addedNodes, ...mutation.removedNodes].some(
      nodeContainsLink
    );
  }

  function scheduleRescan() {
    if (rescanTimer !== null) {
      return;
    }

    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      scanLinks();
    }, 100);
  }

  let settingsReady = Promise.resolve();

  extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) {
      return undefined;
    }

    if (message.type === "LINKGUARD_APPLY_SETTINGS") {
      userSettings = settingsHelpers.sanitizeSettings(message.settings);
      sendResponse(scanLinks());
      return undefined;
    }

    if (message.type === "LINKGUARD_GET_SUMMARY") {
      settingsReady.then(() => sendResponse(scanLinks()));
      return true;
    }

    return undefined;
  });

  if (extensionApi.storage && extensionApi.storage.local) {
    settingsReady = settingsHelpers
      .getSettings(extensionApi)
      .then((settings) => {
        userSettings = settings;
        scanLinks();
      })
      .catch(() => {
        scanLinks();
      });

    if (extensionApi.storage.onChanged) {
      extensionApi.storage.onChanged.addListener((changes, areaName) => {
        const change = changes[settingsHelpers.STORAGE_KEY];
        if (areaName === "local" && change) {
          userSettings = settingsHelpers.sanitizeSettings(change.newValue);
          scanLinks();
        }
      });
    }
  } else {
    scanLinks();
  }

  if (typeof MutationObserver !== "undefined") {
    linkObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesLink)) {
        scheduleRescan();
      }
    });
    observeScanRoots();
  }
})();

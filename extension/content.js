(function () {
  "use strict";

  const extensionApi = typeof browser !== "undefined" ? browser : chrome;
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

  const COMMON_CC_SECOND_LEVEL_LABELS = new Set([
    "ac",
    "co",
    "com",
    "edu",
    "gov",
    "net",
    "org"
  ]);

  // These services assign independent sites below a shared parent domain. Treat
  // the tenant label as part of the site boundary when comparing visible and
  // destination domains.
  const SHARED_HOSTING_SUFFIXES = new Set([
    "app.link",
    "appspot.com",
    "cloudfront.net",
    "firebaseapp.com",
    "github.io",
    "herokuapp.com",
    "netlify.app",
    "pages.dev",
    "vercel.app",
    "web.app"
  ]);

  // Some services use a separate, first-party domain for short or deep links.
  // These groups are intentionally small: only domains that can safely be
  // treated as the same destination identity belong here.
  const RELATED_SITE_GROUPS = [
    new Set(["reddit.com", "redd.it", "reddit.app.link"])
  ];

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
    { name: "microsoft", domains: ["microsoft.com", "office.com", "live.com"] },
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
    totalLinks: 0,
    suspiciousLinks: 0,
    reasons: {}
  };

  function normalizeHost(hostname) {
    return hostname
      .toLowerCase()
      .replace(/\.+$/, "")
      .replace(/^www\./, "");
  }

  function isSameOrSubdomain(hostname, domain) {
    return hostname === domain || hostname.endsWith("." + domain);
  }

  function getSimpleBaseDomain(hostname) {
    const host = normalizeHost(hostname);
    if (isIpAddress(host)) {
      return host;
    }

    const parts = host.split(".").filter(Boolean);
    if (parts.length <= 2) {
      return parts.join(".");
    }

    const sharedSuffix = Array.from(SHARED_HOSTING_SUFFIXES).find(
      (suffix) => host === suffix || host.endsWith("." + suffix)
    );
    if (sharedSuffix) {
      if (host === sharedSuffix) {
        return host;
      }

      const tenantLabels = host
        .slice(0, -(sharedSuffix.length + 1))
        .split(".");
      return tenantLabels.at(-1) + "." + sharedSuffix;
    }

    const topLevel = parts.at(-1);
    const secondLevel = parts.at(-2);
    if (
      topLevel.length === 2 &&
      COMMON_CC_SECOND_LEVEL_LABELS.has(secondLevel) &&
      parts.length >= 3
    ) {
      return parts.slice(-3).join(".");
    }

    return parts.slice(-2).join(".");
  }

  function getUrl(anchor) {
    try {
      return new URL(anchor.href);
    } catch (_error) {
      return null;
    }
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
      }
    }

    return { candidateText, matches };
  }

  function isSimpleDestinationClaim(candidateText, match) {
    const prefix = candidateText.slice(0, match.index);
    const suffix = candidateText.slice(match.index + match.raw.length);
    const wrapperOnlyPrefix = /^[\s([{"'“‘]*$/u.test(prefix);
    const destinationCuePrefix =
      /^[\s([{"'“‘]*(?:open|visit|go(?:\s+to)?|browse(?:\s+to)?|continue(?:\s+to)?|read(?:\s+(?:at|on))?|sign\s+in(?:\s+(?:to|at))?|log\s+in(?:\s+(?:to|at))?|website|link)\s*[:\-–—]?\s*$/iu.test(
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

  function extractClaimedVisibleDomain(text) {
    const { candidateText, matches } = findVisibleDomains(text);
    if (matches.length === 0) {
      return null;
    }

    // Multiple domains in one label can explicitly claim one destination and
    // then point somewhere else. Keep checking the first one in that case.
    if (matches.length > 1) {
      return matches[0].host;
    }

    // A domain mentioned inside a headline or rich-card description is not
    // necessarily the destination claimed by the link. Only compare a single
    // domain when the label itself is URL-like or uses a short navigation cue.
    return isSimpleDestinationClaim(candidateText, matches[0])
      ? matches[0].host
      : null;
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

  function hasMismatchedVisibleDomain(anchor, targetHost) {
    const targetBaseDomain = getSimpleBaseDomain(targetHost);

    return getPresentedLinkTexts(anchor).some((text) => {
      const visibleDomain = extractClaimedVisibleDomain(text);
      const visibleBaseDomain = visibleDomain
        ? getSimpleBaseDomain(visibleDomain)
        : null;
      return (
        visibleBaseDomain &&
        visibleBaseDomain !== targetBaseDomain &&
        !RELATED_SITE_GROUPS.some(
          (group) =>
            group.has(visibleBaseDomain) && group.has(targetBaseDomain)
        )
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

    return BRANDS.some((brand) => {
      const isOfficial = brand.domains.some((domain) => isSameOrSubdomain(host, domain));
      if (isOfficial) {
        return false;
      }

      return decodedLabels.some((label) => labelUsesBrand(label, brand.name));
    });
  }

  function getSuspiciousReasons(anchor) {
    const url = getUrl(anchor);
    if (!url || !["http:", "https:"].includes(url.protocol)) {
      return [];
    }

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

    if (hasMismatchedVisibleDomain(anchor, host)) {
      reasons.push("visible domain mismatch");
    }

    if (hasBrandImpersonation(host)) {
      reasons.push("possible brand impersonation");
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
    label.textContent = "Check This Link";
    shadowRoot.append(style, label);

    return badgeHost;
  }

  function markSuspicious(anchor, reasons) {
    anchor.setAttribute("data-linkguard-original-title", anchor.getAttribute("title") || "");
    anchor.classList.add("linkguard-suspicious-link");
    anchor.setAttribute("data-linkguard-reasons", reasons.join(", "));
    anchor.title = anchor.title
      ? anchor.title + " | Check This Link: " + reasons.join(", ")
      : "Check This Link: " + reasons.join(", ");

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
      totalLinks: anchors.length,
      suspiciousLinks: 0,
      reasons: {}
    };

    anchors.forEach((anchor) => {
      clearCheckThisLinkMarks(anchor);

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
      clearTimeout(rescanTimer);
    }

    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      scanLinks();
    }, 100);
  }

  extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "LINKGUARD_GET_SUMMARY") {
      sendResponse(scanLinks());
    }
  });

  scanLinks();

  if (typeof MutationObserver !== "undefined") {
    linkObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesLink)) {
        scheduleRescan();
      }
    });
    observeScanRoots();
  }
})();

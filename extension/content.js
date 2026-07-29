(function () {
  "use strict";

  const extensionApi = typeof browser !== "undefined" ? browser : chrome;

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

  const BRANDS = [
    { name: "google", domains: ["google.com", "gmail.com"] },
    { name: "microsoft", domains: ["microsoft.com", "office.com", "live.com"] },
    { name: "apple", domains: ["apple.com"] },
    { name: "amazon", domains: ["amazon.com"] },
    { name: "paypal", domains: ["paypal.com"] },
    { name: "netflix", domains: ["netflix.com"] },
    { name: "facebook", domains: ["facebook.com", "fb.com"] },
    { name: "instagram", domains: ["instagram.com"] },
    { name: "linkedin", domains: ["linkedin.com"] },
    { name: "github", domains: ["github.com"] }
  ];

  let lastScan = {
    totalLinks: 0,
    suspiciousLinks: 0,
    reasons: {}
  };

  function normalizeHost(hostname) {
    return hostname.toLowerCase().replace(/^www\./, "");
  }

  function isSameOrSubdomain(hostname, domain) {
    return hostname === domain || hostname.endsWith("." + domain);
  }

  function getSimpleBaseDomain(hostname) {
    const parts = normalizeHost(hostname).split(".").filter(Boolean);
    if (parts.length <= 2) {
      return parts.join(".");
    }

    const lastTwo = parts.slice(-2).join(".");
    const publicSuffixLike = new Set(["co.uk", "org.uk", "ac.uk", "com.au", "com.br"]);
    if (publicSuffixLike.has(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join(".");
    }

    return lastTwo;
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

  function extractVisibleDomain(text) {
    const cleaned = text.trim().toLowerCase();
    const match = cleaned.match(
      /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#:\s]|$)/i
    );

    return match ? normalizeHost(match[1]) : null;
  }

  function hasMismatchedVisibleDomain(anchor, targetHost) {
    const visibleDomain = extractVisibleDomain(anchor.textContent || "");
    if (!visibleDomain) {
      return false;
    }

    return getSimpleBaseDomain(visibleDomain) !== getSimpleBaseDomain(targetHost);
  }

  function hasBrandImpersonation(hostname) {
    const host = normalizeHost(hostname);
    const compactHost = host.replace(/[^a-z0-9]/g, "");

    return BRANDS.some((brand) => {
      const isOfficial = brand.domains.some((domain) => isSameOrSubdomain(host, domain));
      if (isOfficial) {
        return false;
      }

      return compactHost.includes(brand.name);
    });
  }

  function getSuspiciousReasons(anchor) {
    const url = getUrl(anchor);
    if (!url || !["http:", "https:"].includes(url.protocol)) {
      return [];
    }

    const host = normalizeHost(url.hostname);
    const reasons = [];

    if (SHORTENER_HOSTS.has(host)) {
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

    const badge = anchor.querySelector(":scope > .linkguard-badge");
    if (badge) {
      badge.remove();
    }
  }

  function markSuspicious(anchor, reasons) {
    anchor.setAttribute("data-linkguard-original-title", anchor.getAttribute("title") || "");
    anchor.classList.add("linkguard-suspicious-link");
    anchor.setAttribute("data-linkguard-reasons", reasons.join(", "));
    anchor.title = anchor.title
      ? anchor.title + " | Check This Link: " + reasons.join(", ")
      : "Check This Link: " + reasons.join(", ");

    if (!anchor.querySelector(":scope > .linkguard-badge")) {
      const badge = document.createElement("span");
      badge.className = "linkguard-badge";
      badge.textContent = "Check This Link";
      anchor.appendChild(badge);
    }
  }

  function scanLinks() {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
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
    return summary;
  }

  extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "LINKGUARD_GET_SUMMARY") {
      sendResponse(scanLinks());
    }
  });

  scanLinks();
})();

(function () {
  "use strict";

  const STORAGE_KEY = "linkGuardSettings";
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    falsePositiveLinks: [],
    falseNegativeLinks: []
  });

  function normalizeLink(value) {
    try {
      const url = new URL(String(value).trim());
      if (!['http:', 'https:'].includes(url.protocol)) {
        return null;
      }

      // A fragment never changes the network destination and often changes as
      // a user moves around a page. Ignoring it makes an exception stable.
      url.hash = "";
      return url.href;
    } catch (_error) {
      return null;
    }
  }

  function normalizeList(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(value.map(normalizeLink).filter(Boolean))
    ).sort();
  }

  function sanitizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const falseNegativeLinks = normalizeList(source.falseNegativeLinks);
    const falseNegativeSet = new Set(falseNegativeLinks);

    return {
      enabled: source.enabled !== false,
      falsePositiveLinks: normalizeList(source.falsePositiveLinks).filter(
        (link) => !falseNegativeSet.has(link)
      ),
      falseNegativeLinks
    };
  }

  function getSettings(extensionApi) {
    if (!extensionApi.storage || !extensionApi.storage.local) {
      return Promise.resolve(sanitizeSettings(DEFAULT_SETTINGS));
    }

    if (typeof browser !== "undefined") {
      return extensionApi.storage.local
        .get(STORAGE_KEY)
        .then((stored) => sanitizeSettings(stored[STORAGE_KEY]));
    }

    return new Promise((resolve, reject) => {
      extensionApi.storage.local.get(STORAGE_KEY, (stored) => {
        if (extensionApi.runtime.lastError) {
          reject(extensionApi.runtime.lastError);
          return;
        }
        resolve(sanitizeSettings(stored[STORAGE_KEY]));
      });
    });
  }

  function setSettings(extensionApi, value) {
    const settings = sanitizeSettings(value);
    const update = { [STORAGE_KEY]: settings };

    if (typeof browser !== "undefined") {
      return extensionApi.storage.local.set(update).then(() => settings);
    }

    return new Promise((resolve, reject) => {
      extensionApi.storage.local.set(update, () => {
        if (extensionApi.runtime.lastError) {
          reject(extensionApi.runtime.lastError);
          return;
        }
        resolve(settings);
      });
    });
  }

  globalThis.CheckThisLinkSettings = Object.freeze({
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    normalizeLink,
    sanitizeSettings,
    getSettings,
    setSettings
  });
})();

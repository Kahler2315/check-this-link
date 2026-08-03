(function () {
  "use strict";

  const hasBrowserApi = typeof browser !== "undefined";
  const extensionApi = hasBrowserApi ? browser : chrome;
  const settingsHelpers = globalThis.CheckThisLinkSettings;

  const totalLinks = document.getElementById("total-links");
  const suspiciousLinks = document.getElementById("suspicious-links");
  const reasonList = document.getElementById("reason-list");
  const scanStatus = document.getElementById("scan-status");
  const enabledToggle = document.getElementById("enabled-toggle");
  const settingsMessage = document.getElementById("settings-message");
  const ruleControls = {
    falsePositiveLinks: {
      form: document.getElementById("false-positive-form"),
      input: document.getElementById("false-positive-input"),
      list: document.getElementById("false-positive-list"),
      opposite: "falseNegativeLinks"
    },
    falseNegativeLinks: {
      form: document.getElementById("false-negative-form"),
      input: document.getElementById("false-negative-input"),
      list: document.getElementById("false-negative-list"),
      opposite: "falsePositiveLinks"
    }
  };

  let activeTabId = null;
  let currentSettings = settingsHelpers.sanitizeSettings(
    settingsHelpers.DEFAULT_SETTINGS
  );

  function renderReasons(reasons, enabled) {
    reasonList.innerHTML = "";

    if (!enabled) {
      const item = document.createElement("li");
      item.textContent = "Scanning is turned off.";
      reasonList.appendChild(item);
      return;
    }

    const entries = Object.entries(reasons);
    if (entries.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No suspicious links found.";
      reasonList.appendChild(item);
      return;
    }

    entries.forEach(([reason, count]) => {
      const item = document.createElement("li");
      item.textContent = reason + ": " + count;
      reasonList.appendChild(item);
    });
  }

  function renderSummary(summary) {
    const enabled = summary.enabled !== false;
    totalLinks.textContent = String(summary.totalLinks);
    suspiciousLinks.textContent = String(summary.suspiciousLinks);
    scanStatus.textContent = enabled ? "Local link scan" : "Scanning paused";
    renderReasons(summary.reasons, enabled);
  }

  function renderUnavailable() {
    totalLinks.textContent = "-";
    suspiciousLinks.textContent = "-";
    reasonList.innerHTML = "";

    const item = document.createElement("li");
    item.textContent = "This page cannot be scanned by the content script.";
    reasonList.appendChild(item);
  }

  function renderRuleList(key) {
    const control = ruleControls[key];
    control.list.innerHTML = "";

    if (currentSettings[key].length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "linkguard-empty-rule";
      emptyItem.textContent = "No custom links.";
      control.list.appendChild(emptyItem);
      return;
    }

    currentSettings[key].forEach((link) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const button = document.createElement("button");

      label.textContent = link;
      label.title = link;
      button.type = "button";
      button.className = "linkguard-remove-button";
      button.textContent = "Remove";
      button.setAttribute("aria-label", "Remove " + link);
      button.addEventListener("click", () => removeLink(key, link));
      item.append(label, button);
      control.list.appendChild(item);
    });
  }

  function renderSettings() {
    enabledToggle.checked = currentSettings.enabled;
    renderRuleList("falsePositiveLinks");
    renderRuleList("falseNegativeLinks");
  }

  function queryActiveTab() {
    if (!hasBrowserApi) {
      return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
    }

    return extensionApi.tabs.query({ active: true, currentWindow: true });
  }

  function sendTabMessage(message) {
    if (!activeTabId) {
      return Promise.reject(new Error("No active tab"));
    }

    if (!hasBrowserApi) {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          activeTabId,
          message,
          { frameId: 0 },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }

            resolve(response);
          }
        );
      });
    }

    return extensionApi.tabs.sendMessage(
      activeTabId,
      message,
      { frameId: 0 }
    );
  }

  function refreshSummary() {
    return sendTabMessage({ type: "LINKGUARD_GET_SUMMARY" })
      .then((summary) => {
        if (!summary) {
          throw new Error("No summary returned");
        }
        renderSummary(summary);
      })
      .catch(renderUnavailable);
  }

  function saveSettings(message) {
    settingsMessage.textContent = "";
    return settingsHelpers
      .setSettings(extensionApi, currentSettings)
      .then((settings) => {
        currentSettings = settings;
        renderSettings();
        settingsMessage.textContent = message || "";
        return sendTabMessage({
          type: "LINKGUARD_APPLY_SETTINGS",
          settings: currentSettings
        })
          .then((summary) => {
            if (summary) {
              renderSummary(summary);
            }
          })
          .catch(renderUnavailable);
      })
      .catch(() => {
        settingsMessage.textContent = "Could not save this setting.";
      });
  }

  function addLink(key) {
    const control = ruleControls[key];
    const normalizedLink = settingsHelpers.normalizeLink(control.input.value);
    if (!normalizedLink) {
      settingsMessage.textContent = "Enter a complete http:// or https:// URL.";
      return;
    }

    currentSettings[key] = Array.from(
      new Set([...currentSettings[key], normalizedLink])
    );
    currentSettings[control.opposite] = currentSettings[control.opposite].filter(
      (link) => link !== normalizedLink
    );
    control.input.value = "";
    saveSettings("Custom link saved.");
  }

  function removeLink(key, link) {
    currentSettings[key] = currentSettings[key].filter(
      (candidate) => candidate !== link
    );
    saveSettings("Custom link removed.");
  }

  enabledToggle.addEventListener("change", () => {
    currentSettings.enabled = enabledToggle.checked;
    saveSettings(enabledToggle.checked ? "Scanning enabled." : "Scanning paused.");
  });

  Object.entries(ruleControls).forEach(([key, control]) => {
    control.form.addEventListener("submit", (event) => {
      event.preventDefault();
      addLink(key);
    });
  });

  Promise.all([settingsHelpers.getSettings(extensionApi), queryActiveTab()])
    .then(([settings, tabs]) => {
      currentSettings = settings;
      renderSettings();

      const tab = tabs[0];
      if (!tab || !tab.id) {
        throw new Error("No active tab");
      }
      activeTabId = tab.id;
      return refreshSummary();
    })
    .catch(renderUnavailable);
})();

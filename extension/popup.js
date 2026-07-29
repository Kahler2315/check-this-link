(function () {
  "use strict";

  const hasBrowserApi = typeof browser !== "undefined";
  const extensionApi = hasBrowserApi ? browser : chrome;

  const totalLinks = document.getElementById("total-links");
  const suspiciousLinks = document.getElementById("suspicious-links");
  const reasonList = document.getElementById("reason-list");

  function renderReasons(reasons) {
    reasonList.innerHTML = "";

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
    totalLinks.textContent = String(summary.totalLinks);
    suspiciousLinks.textContent = String(summary.suspiciousLinks);
    renderReasons(summary.reasons);
  }

  function renderUnavailable() {
    totalLinks.textContent = "-";
    suspiciousLinks.textContent = "-";
    reasonList.innerHTML = "";

    const item = document.createElement("li");
    item.textContent = "This page cannot be scanned by the content script.";
    reasonList.appendChild(item);
  }

  function queryActiveTab() {
    if (!hasBrowserApi) {
      return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
    }

    return extensionApi.tabs.query({ active: true, currentWindow: true });
  }

  function sendSummaryRequest(tabId) {
    if (!hasBrowserApi) {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: "LINKGUARD_GET_SUMMARY" }, (summary) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          resolve(summary);
        });
      });
    }

    return extensionApi.tabs.sendMessage(tabId, { type: "LINKGUARD_GET_SUMMARY" });
  }

  queryActiveTab()
    .then((tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        throw new Error("No active tab");
      }

      return sendSummaryRequest(tab.id);
    })
    .then((summary) => {
      if (!summary) {
        throw new Error("No summary returned");
      }

      renderSummary(summary);
    })
    .catch(renderUnavailable);
})();

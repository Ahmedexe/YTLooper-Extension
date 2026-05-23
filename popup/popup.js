(function initializePopup() {
  "use strict";

  const DRAFT_KEY = "ytLoopDraft:v1";

  const elements = {
    pageState: document.querySelector("#pageState"),
    loopBadge: document.querySelector("#loopBadge"),
    startInput: document.querySelector("#startInput"),
    endInput: document.querySelector("#endInput"),
    useStartButton: document.querySelector("#useStartButton"),
    useEndButton: document.querySelector("#useEndButton"),
    startButton: document.querySelector("#startButton"),
    stopButton: document.querySelector("#stopButton"),
    pagePanelButton: document.querySelector("#pagePanelButton"),
    status: document.querySelector("#status")
  };

  let currentVideoKey = null;
  let restoringDraft = false;
  let saveTimer = null;

  function setStatus(message, kind) {
    elements.status.textContent = message || "";
    elements.status.className = `status ${kind || ""}`.trim();
  }

  function setControlsEnabled(enabled) {
    elements.startInput.disabled = !enabled;
    elements.endInput.disabled = !enabled;
    elements.useStartButton.disabled = !enabled;
    elements.useEndButton.disabled = !enabled;
    elements.startButton.disabled = !enabled;
    elements.stopButton.disabled = !enabled;
    elements.pagePanelButton.disabled = !enabled;
  }

  function updateBadge(loopEnabled) {
    elements.loopBadge.textContent = loopEnabled ? "Looping" : "Idle";
    elements.loopBadge.classList.toggle("active", loopEnabled);
  }

  function updatePanelButton(status) {
    const panelEnabled = Boolean(status && status.panelEnabled);
    elements.pagePanelButton.textContent = panelEnabled ? "Hide Page Panel" : "Show Page Panel";
    elements.pagePanelButton.dataset.enabled = panelEnabled ? "true" : "false";
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function sendMessage(type, payload) {
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
      throw new Error("No active tab found.");
    }

    return chrome.tabs.sendMessage(tab.id, {
      type,
      ...(payload || {})
    });
  }

  async function loadDraft() {
    const result = await chrome.storage.local.get(DRAFT_KEY);
    return result[DRAFT_KEY] || null;
  }

  async function saveDraftNow() {
    if (restoringDraft) {
      return;
    }

    await chrome.storage.local.set({
      [DRAFT_KEY]: {
        startValue: elements.startInput.value.trim(),
        endValue: elements.endInput.value.trim(),
        videoKey: currentVideoKey,
        updatedAt: Date.now()
      }
    });
  }

  function saveDraftSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveDraftNow().catch(() => {});
    }, 120);
  }

  async function restoreDraft(status) {
    if (!status || !status.hasVideo || status.loopEnabled) {
      return;
    }

    const draft = await loadDraft();

    if (!draft) {
      return;
    }

    const isSameVideo = draft.videoKey === status.videoKey;
    const isUnscopedDraft = !draft.videoKey;

    if (!isSameVideo && !isUnscopedDraft) {
      return;
    }

    if (elements.startInput.value.trim() || elements.endInput.value.trim()) {
      return;
    }

    restoringDraft = true;

    try {
      elements.startInput.value = draft.startValue || "";
      elements.endInput.value = draft.endValue || "";
    } finally {
      restoringDraft = false;
    }
  }

  function parseInputs() {
    const startRaw = elements.startInput.value.trim();
    const endRaw = elements.endInput.value.trim();

    if (!startRaw || !endRaw) {
      return { ok: false, error: "Please enter both start and end timestamps." };
    }

    const start = YTLoopTime.parseTimestamp(startRaw);
    const end = YTLoopTime.parseTimestamp(endRaw);

    if (!start.ok) {
      return { ok: false, error: start.error };
    }

    if (!end.ok) {
      return { ok: false, error: end.error };
    }

    const validation = YTLoopTime.validateInterval(start.seconds, end.seconds);

    if (!validation.ok) {
      return validation;
    }

    return {
      ok: true,
      startTime: start.seconds,
      endTime: end.seconds
    };
  }

  function applyStatus(status) {
    updateBadge(Boolean(status && status.loopEnabled));
    updatePanelButton(status);
    currentVideoKey = status && status.videoKey ? status.videoKey : null;

    if (!status || !status.hasVideo) {
      elements.pageState.textContent = "No YouTube video detected";
      setControlsEnabled(false);
      setStatus("Open a YouTube video page to set a loop.", "warning");
      return;
    }

    setControlsEnabled(true);

    const durationText = Number.isFinite(status.duration)
      ? YTLoopTime.formatTimestamp(status.duration)
      : "loading";

    elements.pageState.textContent = `Video duration: ${durationText}`;

    if (status.loopEnabled) {
      const start = YTLoopTime.formatTimestamp(status.startTime);
      const end = YTLoopTime.formatTimestamp(status.endTime);
      elements.startInput.value = start;
      elements.endInput.value = end;
      saveDraftNow().catch(() => {});
      setStatus(`Looping from ${start} to ${end}.`, "success");
    } else if (!elements.status.textContent) {
      setStatus("Set a start and end time, then start the loop.", "");
    }
  }

  function handleMessagingError(error) {
    updateBadge(false);
    setControlsEnabled(false);
    elements.pageState.textContent = "Content script unavailable";

    const message = String(error && error.message ? error.message : error);

    if (message.includes("Receiving end does not exist")) {
      setStatus("Open or refresh a YouTube video page, then try again.", "warning");
      return;
    }

    setStatus("Unable to talk to this tab.", "error");
  }

  async function refreshStatus() {
    try {
      const response = await sendMessage("GET_LOOP_STATUS");

      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Unable to read loop status.");
      }

      applyStatus(response.status);
      await restoreDraft(response.status);
    } catch (error) {
      handleMessagingError(error);
    }
  }

  async function useCurrentTime(targetInput) {
    setStatus("Reading current video time...", "");

    try {
      const response = await sendMessage("GET_CURRENT_TIME");

      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Unable to read current time.");
      }

      applyStatus(response.status);
      targetInput.value = YTLoopTime.formatTimestamp(response.currentTime);
      await saveDraftNow();
      setStatus("Timestamp captured.", "success");
    } catch (error) {
      setStatus(error.message || "Unable to read current time.", "error");
    }
  }

  async function startLoop() {
    const parsed = parseInputs();

    if (!parsed.ok) {
      setStatus(parsed.error, "error");
      return;
    }

    setStatus("Starting loop...", "");

    try {
      const response = await sendMessage("START_LOOP", {
        startTime: parsed.startTime,
        endTime: parsed.endTime
      });

      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Unable to start loop.");
      }

      applyStatus(response.status);
      await saveDraftNow();
    } catch (error) {
      setStatus(error.message || "Unable to start loop.", "error");
    }
  }

  async function stopLoop() {
    try {
      const response = await sendMessage("STOP_LOOP");

      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Unable to stop loop.");
      }

      applyStatus(response.status);
      await saveDraftNow();
      setStatus("Loop stopped. Playback will continue normally.", "");
    } catch (error) {
      setStatus(error.message || "Unable to stop loop.", "error");
    }
  }

  async function togglePagePanel() {
    const shouldEnable = elements.pagePanelButton.dataset.enabled !== "true";
    elements.pagePanelButton.disabled = true;
    setStatus(shouldEnable ? "Showing page panel..." : "Hiding page panel...", "");

    try {
      const response = await sendMessage("SET_PANEL_VISIBILITY", {
        enabled: shouldEnable
      });

      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Unable to update page panel.");
      }

      applyStatus(response.status);
      setStatus(shouldEnable ? "Page panel is visible on YouTube." : "Page panel hidden.", "");
    } catch (error) {
      setStatus(error.message || "Unable to update page panel.", "error");
    } finally {
      elements.pagePanelButton.disabled = false;
    }
  }

  elements.useStartButton.addEventListener("click", () => {
    useCurrentTime(elements.startInput);
  });

  elements.useEndButton.addEventListener("click", () => {
    useCurrentTime(elements.endInput);
  });

  elements.startButton.addEventListener("click", startLoop);
  elements.stopButton.addEventListener("click", stopLoop);
  elements.pagePanelButton.addEventListener("click", togglePagePanel);

  [elements.startInput, elements.endInput].forEach((input) => {
    input.addEventListener("input", saveDraftSoon);

    input.addEventListener("change", () => {
      saveDraftNow().catch(() => {});
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        startLoop();
      }
    });
  });

  refreshStatus();
})();

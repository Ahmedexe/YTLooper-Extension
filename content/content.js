(function initializeYouTubeIntervalLooper() {
  "use strict";

  const DRAFT_KEY = "ytLoopDraft:v1";
  const PANEL_PREF_KEY = "ytLoopPanel:v1";

  const state = {
    loopEnabled: false,
    startTime: null,
    endTime: null,
    video: null,
    videoKey: getVideoKey()
  };

  const panel = {
    host: null,
    root: null,
    enabled: false,
    collapsed: false,
    currentVideoKey: null,
    saveTimer: null,
    restoringDraft: false,
    elements: {}
  };

  let observer = null;
  let navigationCheckScheduled = false;

  function getVideoKey() {
    try {
      const url = new URL(location.href);
      return url.pathname === "/watch" ? url.searchParams.get("v") || url.href : url.href;
    } catch (error) {
      return location.href;
    }
  }

  function isUsableVideo(video) {
    return Boolean(video && Number.isFinite(video.duration) && video.duration > 0);
  }

  function findVideo() {
    if (!isWatchPage()) {
      return null;
    }

    const videos = Array.from(document.querySelectorAll("video"));
    return videos.find((video) => video.readyState > 0) || videos[0] || null;
  }

  function isWatchPage() {
    try {
      const url = new URL(location.href);
      return url.hostname.endsWith("youtube.com") && url.pathname === "/watch" && url.searchParams.has("v");
    } catch (error) {
      return false;
    }
  }

  function detachVideoListener() {
    if (state.video) {
      state.video.removeEventListener("timeupdate", handleTimeUpdate);
      state.video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      state.video.removeEventListener("durationchange", handleLoadedMetadata);
    }
  }

  function attachVideo(video) {
    if (!video || state.video === video) {
      return;
    }

    detachVideoListener();
    state.video = video;
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("durationchange", handleLoadedMetadata);
  }

  function getVideo() {
    const video = findVideo();

    if (video) {
      attachVideo(video);
    }

    return state.video || video;
  }

  function handleLoadedMetadata() {
    if (!state.loopEnabled || !state.video) {
      syncPanel();
      return;
    }

    const validation = YTLoopTime.validateInterval(
      state.startTime,
      state.endTime,
      state.video.duration
    );

    if (!validation.ok) {
      stopLoop();
    }

    syncPanel();
  }

  function resetForNavigation() {
    const nextKey = getVideoKey();

    if (nextKey === state.videoKey) {
      getVideo();
      syncPanel();
      return;
    }

    state.videoKey = nextKey;
    state.loopEnabled = false;
    state.startTime = null;
    state.endTime = null;
    detachVideoListener();
    state.video = null;
    getVideo();
    handlePanelNavigation();
  }

  function handleTimeUpdate() {
    const video = state.video || getVideo();

    if (!state.loopEnabled || !video || state.startTime === null || state.endTime === null) {
      return;
    }

    if (video.currentTime < state.startTime - 0.35) {
      video.currentTime = state.startTime;
      return;
    }

    if (video.currentTime >= state.endTime) {
      video.currentTime = state.startTime;

      if (video.paused) {
        video.play().catch(() => {});
      }
    }
  }

  function startLoop(startTime, endTime) {
    const video = getVideo();

    if (!video) {
      return { ok: false, error: "No YouTube video found on this page." };
    }

    if (!isUsableVideo(video)) {
      return { ok: false, error: "Video is still loading. Try again in a moment." };
    }

    const validation = YTLoopTime.validateInterval(startTime, endTime, video.duration);

    if (!validation.ok) {
      return validation;
    }

    state.loopEnabled = true;
    state.startTime = startTime;
    state.endTime = endTime;
    state.videoKey = getVideoKey();

    if (video.currentTime < startTime || video.currentTime >= endTime) {
      video.currentTime = startTime;
    }

    video.play().catch(() => {});
    syncPanel();

    return {
      ok: true,
      status: getStatus()
    };
  }

  function stopLoop() {
    state.loopEnabled = false;
    syncPanel();

    return {
      ok: true,
      status: getStatus()
    };
  }

  async function loadDraft() {
    const result = await chrome.storage.local.get(DRAFT_KEY);
    return result[DRAFT_KEY] || null;
  }

  async function saveDraftValues(startValue, endValue) {
    if (panel.restoringDraft) {
      return;
    }

    await chrome.storage.local.set({
      [DRAFT_KEY]: {
        startValue: String(startValue || "").trim(),
        endValue: String(endValue || "").trim(),
        videoKey: getVideoKey(),
        updatedAt: Date.now()
      }
    });
  }

  function savePanelDraftSoon() {
    clearTimeout(panel.saveTimer);
    panel.saveTimer = setTimeout(() => {
      if (!panel.elements.startInput || !panel.elements.endInput) {
        return;
      }

      saveDraftValues(panel.elements.startInput.value, panel.elements.endInput.value).catch(() => {});
    }, 120);
  }

  async function restorePanelDraft() {
    if (!panel.elements.startInput || !panel.elements.endInput) {
      return;
    }

    const status = getStatus();

    if (!status.hasVideo || status.loopEnabled) {
      return;
    }

    const draft = await loadDraft();

    panel.restoringDraft = true;

    try {
      if (!draft || (draft.videoKey && draft.videoKey !== status.videoKey)) {
        panel.elements.startInput.value = "";
        panel.elements.endInput.value = "";
        return;
      }

      panel.elements.startInput.value = draft.startValue || "";
      panel.elements.endInput.value = draft.endValue || "";
    } finally {
      panel.restoringDraft = false;
    }
  }

  function parseLoopInputs(startValue, endValue) {
    const startRaw = String(startValue || "").trim();
    const endRaw = String(endValue || "").trim();

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

  function setPanelStatus(message, kind) {
    if (!panel.elements.status) {
      return;
    }

    panel.elements.status.textContent = message || "";
    panel.elements.status.dataset.kind = kind || "";
  }

  function setPanelCollapsed(collapsed) {
    panel.collapsed = Boolean(collapsed);

    if (panel.host) {
      panel.host.dataset.collapsed = panel.collapsed ? "true" : "false";
    }

    if (panel.elements.toggleButton) {
      panel.elements.toggleButton.textContent = panel.collapsed ? "Open" : "Hide";
      panel.elements.toggleButton.setAttribute(
        "aria-label",
        panel.collapsed ? "Open interval looper panel" : "Collapse interval looper panel"
      );
    }

    savePanelPrefs().catch(() => {});
  }

  async function savePanelPrefs() {
    await chrome.storage.local.set({
      [PANEL_PREF_KEY]: {
        enabled: panel.enabled,
        collapsed: panel.collapsed
      }
    });
  }

  function setPanelVisible(visible) {
    if (!panel.host) {
      return;
    }

    panel.host.hidden = !visible;
  }

  function syncPanel() {
    if (!panel.enabled) {
      setPanelVisible(false);
      return;
    }

    ensurePanel();

    if (!panel.host || !panel.elements.badge) {
      return;
    }

    const status = getStatus();
    const hasVideo = Boolean(status.hasVideo);

    setPanelVisible(hasVideo);
    panel.currentVideoKey = status.videoKey;
    panel.elements.badge.textContent = status.loopEnabled ? "Looping" : "Idle";
    panel.elements.badge.dataset.active = status.loopEnabled ? "true" : "false";

    if (panel.elements.duration) {
      panel.elements.duration.textContent = Number.isFinite(status.duration)
        ? YTLoopTime.formatTimestamp(status.duration)
        : "loading";
    }

    if (status.loopEnabled && panel.elements.startInput && panel.elements.endInput) {
      const start = YTLoopTime.formatTimestamp(status.startTime);
      const end = YTLoopTime.formatTimestamp(status.endTime);
      panel.elements.startInput.value = start;
      panel.elements.endInput.value = end;
      saveDraftValues(start, end).catch(() => {});
      setPanelStatus(`Looping from ${start} to ${end}.`, "success");
    } else if (hasVideo && panel.elements.status && !panel.elements.status.textContent) {
      setPanelStatus("Set a start and end time.", "");
    }
  }

  async function handlePanelNavigation() {
    syncPanel();
    await restorePanelDraft().catch(() => {});
  }

  async function setPanelEnabled(enabled) {
    panel.enabled = Boolean(enabled);
    await savePanelPrefs().catch(() => {});

    if (!panel.enabled) {
      setPanelVisible(false);
      return {
        ok: true,
        status: getStatus()
      };
    }

    await handlePanelNavigation();

    return {
      ok: true,
      status: getStatus()
    };
  }

  async function loadPanelPrefs() {
    const result = await chrome.storage.local.get(PANEL_PREF_KEY);
    const pref = result[PANEL_PREF_KEY] || {};

    panel.enabled = Boolean(pref.enabled);
    panel.collapsed = Boolean(pref.collapsed);

    if (panel.enabled) {
      await handlePanelNavigation();
    }
  }

  async function usePanelCurrentTime(input) {
    const video = getVideo();

    if (!video) {
      setPanelStatus("No YouTube video found on this page.", "error");
      return;
    }

    input.value = YTLoopTime.formatTimestamp(video.currentTime);
    await saveDraftValues(panel.elements.startInput.value, panel.elements.endInput.value).catch(() => {});
    setPanelStatus("Timestamp captured.", "success");
  }

  async function startPanelLoop() {
    const parsed = parseLoopInputs(panel.elements.startInput.value, panel.elements.endInput.value);

    if (!parsed.ok) {
      setPanelStatus(parsed.error, "error");
      return;
    }

    const response = startLoop(parsed.startTime, parsed.endTime);

    if (!response.ok) {
      setPanelStatus(response.error, "error");
      return;
    }

    await saveDraftValues(panel.elements.startInput.value, panel.elements.endInput.value).catch(() => {});
    syncPanel();
  }

  async function stopPanelLoop() {
    const response = stopLoop();

    if (!response.ok) {
      setPanelStatus(response.error || "Unable to stop loop.", "error");
      return;
    }

    await saveDraftValues(panel.elements.startInput.value, panel.elements.endInput.value).catch(() => {});
    syncPanel();
    setPanelStatus("Loop stopped. Playback will continue normally.", "");
  }

  function ensurePanel() {
    if (panel.host) {
      return;
    }

    const host = document.createElement("div");
    host.id = "yt-interval-looper-panel";
    host.dataset.collapsed = "false";
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "YouTube interval looper");
    document.documentElement.appendChild(host);

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483647;
          color: #1d2433;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        button,
        input {
          font: inherit;
        }

        .panel {
          width: 308px;
          border: 1px solid rgba(25, 32, 45, 0.14);
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 18px 52px rgba(0, 0, 0, 0.22);
          overflow: hidden;
        }

        .bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          background: #f7f8fb;
          border-bottom: 1px solid #e1e6ef;
        }

        .title {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #1d2433;
          font-size: 13px;
          font-weight: 750;
        }

        .mark {
          width: 18px;
          height: 18px;
          border-radius: 5px;
          background: #d82742;
          position: relative;
          flex: 0 0 auto;
        }

        .mark::after {
          content: "";
          position: absolute;
          left: 7px;
          top: 5px;
          border-left: 6px solid #fff;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
        }

        .badge {
          margin-left: auto;
          border: 1px solid #d7dde8;
          border-radius: 999px;
          padding: 3px 7px;
          background: #fff;
          color: #637083;
          font-size: 11px;
          font-weight: 750;
        }

        .badge[data-active="true"] {
          border-color: rgba(20, 108, 67, 0.22);
          background: #eaf7ef;
          color: #146c43;
        }

        .toggle {
          height: 28px;
          border: 1px solid #d7dde8;
          border-radius: 7px;
          padding: 0 9px;
          background: #ffffff;
          color: #3f4b5f;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        .body {
          display: grid;
          gap: 10px;
          padding: 12px;
        }

        :host([data-collapsed="true"]) .panel {
          width: auto;
        }

        :host([data-collapsed="true"]) .bar {
          border-bottom: 0;
        }

        :host([data-collapsed="true"]) .body,
        :host([data-collapsed="true"]) .badge {
          display: none;
        }

        .meta {
          color: #637083;
          font-size: 12px;
          line-height: 1.3;
        }

        .fields {
          display: grid;
          gap: 8px;
        }

        label {
          display: grid;
          gap: 5px;
          color: #1d2433;
          font-size: 12px;
          font-weight: 750;
        }

        .row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 86px;
          gap: 7px;
        }

        input {
          min-width: 0;
          height: 34px;
          border: 1px solid #d7dde8;
          border-radius: 7px;
          padding: 0 9px;
          background: #fff;
          color: #1d2433;
          outline: none;
          font-size: 13px;
        }

        input:focus {
          border-color: #2663eb;
          box-shadow: 0 0 0 3px rgba(38, 99, 235, 0.14);
        }

        .current,
        .primary,
        .stop {
          height: 34px;
          border: 1px solid transparent;
          border-radius: 7px;
          padding: 0 9px;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        .current {
          border-color: #d7dde8;
          background: #f7f8fb;
          color: #1d2433;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 74px;
          gap: 7px;
        }

        .primary {
          background: #d82742;
          color: #ffffff;
        }

        .stop {
          border-color: #d7dde8;
          background: #ffffff;
          color: #637083;
        }

        .status {
          min-height: 32px;
          border: 1px solid #d7dde8;
          border-radius: 7px;
          padding: 7px 8px;
          background: #ffffff;
          color: #637083;
          font-size: 12px;
          line-height: 1.3;
        }

        .status[data-kind="success"] {
          border-color: rgba(20, 108, 67, 0.22);
          background: #edf8f1;
          color: #146c43;
        }

        .status[data-kind="error"] {
          border-color: rgba(216, 39, 66, 0.26);
          background: #fff0f3;
          color: #b8162f;
        }

        @media (max-width: 520px) {
          :host {
            right: 10px;
            bottom: 10px;
            left: 10px;
          }

          .panel {
            width: 100%;
          }
        }
      </style>

      <div class="panel">
        <div class="bar">
          <div class="title">
            <span class="mark" aria-hidden="true"></span>
            <span>Interval Looper</span>
          </div>
          <span class="badge">Idle</span>
          <button class="toggle" type="button" aria-label="Collapse interval looper panel">Hide</button>
        </div>
        <div class="body">
          <div class="meta">Duration: <span class="duration">loading</span></div>
          <div class="fields">
            <label>
              Start
              <span class="row">
                <input class="start" type="text" inputmode="numeric" autocomplete="off" placeholder="00:30">
                <button class="current use-start" type="button">Current</button>
              </span>
            </label>
            <label>
              End
              <span class="row">
                <input class="end" type="text" inputmode="numeric" autocomplete="off" placeholder="01:15">
                <button class="current use-end" type="button">Current</button>
              </span>
            </label>
          </div>
          <div class="actions">
            <button class="primary" type="button">Start Loop</button>
            <button class="stop" type="button">Stop</button>
          </div>
          <div class="status" role="status" aria-live="polite">Set a start and end time.</div>
        </div>
      </div>
    `;

    panel.host = host;
    panel.root = root;
    panel.elements = {
      badge: root.querySelector(".badge"),
      toggleButton: root.querySelector(".toggle"),
      duration: root.querySelector(".duration"),
      startInput: root.querySelector(".start"),
      endInput: root.querySelector(".end"),
      useStartButton: root.querySelector(".use-start"),
      useEndButton: root.querySelector(".use-end"),
      startButton: root.querySelector(".primary"),
      stopButton: root.querySelector(".stop"),
      status: root.querySelector(".status")
    };

    root.querySelector(".panel").addEventListener("click", (event) => event.stopPropagation());
    root.querySelector(".panel").addEventListener("mousedown", (event) => event.stopPropagation());
    root.querySelector(".panel").addEventListener("mouseup", (event) => event.stopPropagation());
    root.querySelector(".panel").addEventListener("pointerdown", (event) => event.stopPropagation());
    root.querySelector(".panel").addEventListener("pointerup", (event) => event.stopPropagation());

    panel.elements.toggleButton.addEventListener("click", () => {
      setPanelCollapsed(!panel.collapsed);
    });

    panel.elements.useStartButton.addEventListener("click", () => {
      usePanelCurrentTime(panel.elements.startInput);
    });

    panel.elements.useEndButton.addEventListener("click", () => {
      usePanelCurrentTime(panel.elements.endInput);
    });

    panel.elements.startButton.addEventListener("click", startPanelLoop);
    panel.elements.stopButton.addEventListener("click", stopPanelLoop);

    [panel.elements.startInput, panel.elements.endInput].forEach((input) => {
      input.addEventListener("input", savePanelDraftSoon);
      input.addEventListener("change", () => {
        saveDraftValues(panel.elements.startInput.value, panel.elements.endInput.value).catch(() => {});
      });
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();

        if (event.key === "Enter") {
          startPanelLoop();
        }
      });
      input.addEventListener("keyup", (event) => event.stopPropagation());
    });

    setPanelCollapsed(panel.collapsed);

    restorePanelDraft().catch(() => {});
  }

  function getStatus() {
    const video = getVideo();
    const hasVideo = isWatchPage() && Boolean(video);
    const duration = hasVideo && Number.isFinite(video.duration) ? video.duration : null;

    return {
      hasVideo,
      duration,
      currentTime: hasVideo ? video.currentTime : null,
      loopEnabled: state.loopEnabled,
      startTime: state.startTime,
      endTime: state.endTime,
      videoKey: state.videoKey,
      panelEnabled: panel.enabled,
      panelCollapsed: panel.collapsed
    };
  }

  function sendResponseSafely(sendResponse, response) {
    sendResponse(response);
    return true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    resetForNavigation();

    if (!message || !message.type) {
      return sendResponseSafely(sendResponse, {
        ok: false,
        error: "Unknown request."
      });
    }

    if (message.type === "PING") {
      return sendResponseSafely(sendResponse, {
        ok: true,
        status: getStatus()
      });
    }

    if (message.type === "GET_CURRENT_TIME") {
      const video = getVideo();

      if (!video) {
        return sendResponseSafely(sendResponse, {
          ok: false,
          error: "No YouTube video found on this page."
        });
      }

      return sendResponseSafely(sendResponse, {
        ok: true,
        currentTime: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : null,
        status: getStatus()
      });
    }

    if (message.type === "START_LOOP") {
      return sendResponseSafely(
        sendResponse,
        startLoop(Number(message.startTime), Number(message.endTime))
      );
    }

    if (message.type === "STOP_LOOP") {
      return sendResponseSafely(sendResponse, stopLoop());
    }

    if (message.type === "GET_LOOP_STATUS") {
      return sendResponseSafely(sendResponse, {
        ok: true,
        status: getStatus()
      });
    }

    if (message.type === "SET_PANEL_VISIBILITY") {
      setPanelEnabled(Boolean(message.enabled))
        .then((response) => sendResponse(response))
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error && error.message ? error.message : "Unable to update panel."
          });
        });
      return true;
    }

    return sendResponseSafely(sendResponse, {
      ok: false,
      error: "Unknown request."
    });
  });

  function observeNavigation() {
    if (observer) {
      return;
    }

    observer = new MutationObserver(scheduleNavigationCheck);

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener("yt-navigate-finish", resetForNavigation);
    window.addEventListener("popstate", resetForNavigation);
  }

  function scheduleNavigationCheck() {
    if (navigationCheckScheduled) {
      return;
    }

    navigationCheckScheduled = true;

    requestAnimationFrame(() => {
      navigationCheckScheduled = false;
      resetForNavigation();
    });
  }

  getVideo();
  observeNavigation();
  loadPanelPrefs().catch(() => {});
})();

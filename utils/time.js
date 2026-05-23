(function exposeTimeUtils(global) {
  "use strict";

  const MAX_SEGMENTS = 3;

  function parseTimestamp(value) {
    const raw = String(value || "").trim();

    if (!raw) {
      return { ok: false, error: "Please enter both start and end timestamps." };
    }

    if (!/^\d+(?::\d{1,2}){0,2}$/.test(raw)) {
      return { ok: false, error: "Invalid timestamp format." };
    }

    const parts = raw.split(":").map((part) => Number(part));

    if (parts.length > MAX_SEGMENTS || parts.some((part) => !Number.isInteger(part))) {
      return { ok: false, error: "Invalid timestamp format." };
    }

    if (parts.length > 1 && parts.slice(1).some((part) => part > 59)) {
      return { ok: false, error: "Minutes and seconds must be between 0 and 59." };
    }

    let seconds = 0;

    if (parts.length === 1) {
      seconds = parts[0];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    return { ok: true, seconds };
  }

  function pad(number) {
    return String(Math.floor(number)).padStart(2, "0");
  }

  function formatTimestamp(totalSeconds, options) {
    const settings = options || {};
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (settings.alwaysShowHours || hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function validateInterval(startSeconds, endSeconds, duration) {
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      return { ok: false, error: "Invalid timestamp format." };
    }

    if (startSeconds < 0 || endSeconds < 0) {
      return { ok: false, error: "Timestamp cannot be negative." };
    }

    if (startSeconds >= endSeconds) {
      return { ok: false, error: "Start time must be less than end time." };
    }

    if (Number.isFinite(duration) && duration > 0 && endSeconds > duration) {
      return { ok: false, error: "Timestamp is outside the video duration." };
    }

    return { ok: true };
  }

  global.YTLoopTime = {
    parseTimestamp,
    formatTimestamp,
    validateInterval
  };
})(typeof globalThis !== "undefined" ? globalThis : window);

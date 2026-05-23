# YouTube Interval Looper

A Chrome Manifest V3 extension for looping a custom section of a YouTube video.

## Features

- Set start and end timestamps manually.
- Capture the current YouTube playback time for either endpoint.
- Keep draft timestamps when the popup closes before a loop is started.
- Optionally show a persistent in-page looper panel while clicking or scrubbing the YouTube page.
- Loop continuously between the selected start and end times.
- Stop looping without interrupting normal playback.
- Validate empty inputs, invalid timestamps, reversed ranges, out-of-duration values, and missing videos.

Supported timestamp formats include:

```text
90
1:30
01:30
00:01:30
1:02:15
```

## Load Locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this extension directory.
5. Open a YouTube video page.
6. Use the extension icon popup.
7. Click **Show Page Panel** in the popup if you want the floating in-page controls.

## Project Structure

```text
.
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   └── content.js
├── utils/
│   └── time.js
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Notes

The Chrome toolbar popup closes when focus returns to the page, so the popup includes a **Show Page Panel** option for a small floating YouTube panel that stays visible while you click or scrub the video. The extension uses a declared content script on YouTube pages and requests `storage` so draft timestamps and the panel visibility/collapsed state persist. Loop state lives in the content script and resets when YouTube navigates to a different video.

# YouTube Interval Looper Extension — Project Context

## Project Overview

This project is a Chrome extension that allows users to loop a specific interval of a YouTube video.

The user should be able to define a loop interval using two timestamps:

1. **Start timestamp**
2. **End timestamp**

The extension should support two ways of setting each timestamp:

- Manually entering the timestamp in a text box.
- Clicking a button that registers the current playback time of the YouTube video.

Once the interval is set, the YouTube video should continuously loop between the selected start and end timestamps.

The extension must also validate user input and handle incorrect cases safely, such as invalid timestamp formats, timestamps outside the video duration, or an end timestamp that comes before the start timestamp.

---

## Main Goal

Create a Chrome extension for YouTube that lets the user repeatedly loop a custom section of a video.

Example use cases:

- Repeating a lecture explanation.
- Practicing a song section.
- Reviewing a specific part of a tutorial.
- Rewatching a short clip without manually seeking back.

---

## Target Platform

The extension targets:

- Google Chrome
- YouTube video pages
- Chrome Extensions Manifest V3

The file structure should follow the standard Chrome Web Store / Google Chrome extension format, where `manifest.json` is placed at the root of the extension directory.

---

## Expected File Structure

Recommended structure:

```text
youtube-interval-looper/
├── manifest.json
├── README.md
├── context.md
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   └── content.js
└── utils/
    └── time.js
```

### File Responsibilities

#### `manifest.json`

Defines the Chrome extension metadata, permissions, content scripts, popup page, and icons.

Expected responsibilities:

- Use Manifest V3.
- Define the extension name, version, and description.
- Register the popup UI.
- Register the content script for YouTube pages.
- Restrict content script matching to YouTube video pages when possible.

Example target URL pattern:

```json
"https://www.youtube.com/*"
```

The extension should mainly operate on YouTube watch pages, such as:

```text
https://www.youtube.com/watch?v=VIDEO_ID
```

---

#### `popup/popup.html`

The popup UI shown when the user clicks the extension icon.

Expected UI elements:

- Start timestamp input box.
- End timestamp input box.
- Button to register the current video time as the start timestamp.
- Button to register the current video time as the end timestamp.
- Button to start looping.
- Button to stop looping.
- Optional status/error message area.

Possible UI layout:

```text
Start Time: [ 00:01:30 ] [Use Current Time]
End Time:   [ 00:02:15 ] [Use Current Time]

[Start Loop]
[Stop Loop]

Status: Looping from 00:01:30 to 00:02:15
```

---

#### `popup/popup.js`

Handles popup behavior and communication with the content script.

Expected responsibilities:

- Read user input from the popup.
- Send messages to the content script.
- Request the current video time from the content script.
- Send loop start and end times to the content script.
- Display validation messages or errors.
- Display current loop status.

Possible message types:

```js
GET_CURRENT_TIME
SET_START_TIME
SET_END_TIME
START_LOOP
STOP_LOOP
GET_LOOP_STATUS
```

---

#### `popup/popup.css`

Styles the popup interface.

Expected responsibilities:

- Keep the UI clean and compact.
- Make inputs and buttons easy to use.
- Show errors clearly.
- Keep the popup width reasonable, for example around 300px.

---

#### `content/content.js`

Runs inside YouTube pages and controls the video element.

Expected responsibilities:

- Detect the active YouTube `<video>` element.
- Get the current playback time.
- Get the video duration.
- Seek the video to the start timestamp when needed.
- Monitor playback time while looping.
- If the video reaches or passes the end timestamp, reset it back to the start timestamp.
- Stop looping when the user clicks the stop button.
- Return useful errors if no video is found.

Core logic:

```js
if (loopEnabled && video.currentTime >= endTime) {
  video.currentTime = startTime;
  video.play();
}
```

The content script should handle YouTube’s single-page application behavior, where navigating between videos may not fully reload the page.

---

#### `utils/time.js`

Contains helper functions for timestamp parsing and formatting.

Expected responsibilities:

- Convert timestamps like `1:30`, `01:30`, `00:01:30`, or `90` into seconds.
- Convert seconds into a readable timestamp format.
- Validate timestamp format.
- Check whether start and end times are within the video duration.
- Check whether start time is less than end time.

Possible supported input formats:

```text
90
1:30
01:30
00:01:30
1:02:15
```

Possible output format:

```text
HH:MM:SS
```

or, for shorter videos:

```text
MM:SS
```

---

## Core Features

### 1. Manual Timestamp Input

The user can type the start and end timestamps manually.

Supported examples:

```text
10
1:05
01:05
00:01:05
1:02:30
```

The extension should convert these values to seconds internally.

---

### 2. Register Current Timestamp

The user can click a button to use the current YouTube playback time.

Required buttons:

- `Use Current Time as Start`
- `Use Current Time as End`

When clicked, the popup asks the content script for the current video time and fills the corresponding input box.

---

### 3. Loop Selected Interval

After the user defines valid start and end timestamps, they can click `Start Loop`.

The video should then loop continuously between:

```text
startTime <= currentTime < endTime
```

When the video reaches the end timestamp, the extension should set:

```js
video.currentTime = startTime;
```

and continue playback.

---

### 4. Stop Looping

The user can stop the loop by clicking `Stop Loop`.

When stopped:

- The video should continue normally from its current position.
- The extension should no longer seek back to the start time.
- The stored start and end values may remain visible in the popup.

---

## Validation Requirements

The extension must handle wrong inputs clearly and safely.

### Invalid Timestamp Format

Examples:

```text
abc
1::30
1:2:3:4
-10
1:-20
```

Expected behavior:

- Do not start looping.
- Show an error message such as:

```text
Invalid timestamp format.
```

---

### Empty Inputs

If the start or end timestamp is missing:

Expected behavior:

- Do not start looping.
- Show an error message such as:

```text
Please enter both start and end timestamps.
```

---

### Start Time Greater Than or Equal to End Time

Example:

```text
Start: 02:00
End: 01:00
```

Expected behavior:

- Do not start looping.
- Show an error message such as:

```text
Start time must be less than end time.
```

---

### Timestamp Outside Video Duration

Example:

```text
Video duration: 05:00
Start: 01:00
End: 10:00
```

Expected behavior:

- Do not start looping.
- Show an error message such as:

```text
Timestamp is outside the video duration.
```

---

### No YouTube Video Found

If the user opens the extension on a non-video YouTube page or another website:

Expected behavior:

- Disable loop controls or show an error.
- Show a message such as:

```text
No YouTube video found on this page.
```

---

## Permissions

The extension should request only the minimum permissions needed.

Possible permissions:

```json
"permissions": [
  "activeTab",
  "scripting"
]
```

Possible host permissions:

```json
"host_permissions": [
  "https://www.youtube.com/*"
]
```

If using a declared content script in `manifest.json`, the project may not need to inject scripts manually using the `scripting` API.

The final permission set should be kept minimal to improve Chrome Web Store approval chances.

---

## Message Passing Design

The popup cannot directly access the YouTube video element because it runs in the extension popup context.

Therefore:

- `popup.js` handles the user interface.
- `content.js` interacts with the YouTube page and video element.
- They communicate using Chrome extension message passing.

Example flow:

```text
User clicks "Use Current Time as Start"
        ↓
popup.js sends GET_CURRENT_TIME message
        ↓
content.js reads video.currentTime
        ↓
content.js sends time back
        ↓
popup.js fills the start timestamp input
```

Another example:

```text
User clicks "Start Loop"
        ↓
popup.js validates basic input
        ↓
popup.js sends START_LOOP with startTime and endTime
        ↓
content.js validates against video duration
        ↓
content.js enables loop behavior
```

---

## State Management

The extension should keep track of:

```js
let loopEnabled = false;
let startTime = null;
let endTime = null;
```

This state can live in `content.js`.

Optional future improvement:

- Store the last used start and end times using `chrome.storage`.
- Restore loop settings when the popup is reopened.
- Save loop intervals per video ID.

---

## YouTube-Specific Considerations

YouTube is a single-page application. This means that moving from one video to another does not always reload the whole page.

The extension should consider:

- Re-detecting the video element when the page changes.
- Resetting loop state when the user opens a different video.
- Handling cases where the video element loads after the content script starts.
- Avoiding multiple duplicate interval timers or event listeners.

Recommended approach:

- Use a function like `getVideoElement()`.
- Use `timeupdate` event listener on the video.
- Avoid using many `setInterval` timers unless necessary.

Example:

```js
video.addEventListener("timeupdate", handleTimeUpdate);
```

---

## Suggested Implementation Strategy

### Phase 1: Basic Working Version

Implement:

- `manifest.json`
- Basic popup UI
- Manual timestamp input
- Content script that finds the YouTube video
- Start loop
- Stop loop

Goal:

```text
The user can manually enter start and end timestamps and loop a video interval.
```

---

### Phase 2: Current Time Buttons

Add:

- Use current time as start.
- Use current time as end.
- Format the returned time nicely in the popup.

Goal:

```text
The user can set timestamps without typing them manually.
```

---

### Phase 3: Validation and Error Handling

Add:

- Invalid timestamp format handling.
- Empty input handling.
- Out-of-duration handling.
- Start greater than or equal to end handling.
- No-video-found handling.

Goal:

```text
The extension does not break or behave unexpectedly when the user gives wrong input.
```

---

### Phase 4: Polish for Chrome Web Store

Add:

- Icons.
- Better UI styling.
- README.
- Screenshots.
- Clear description.
- Minimal permissions.
- Privacy policy if needed.
- Test on different YouTube video URLs.

Goal:

```text
The extension is ready to be packaged and submitted to the Chrome Web Store.
```

---

## Acceptance Criteria

The extension is considered successful if:

- It loads correctly from `chrome://extensions` using `Load unpacked`.
- It works on YouTube video pages.
- It can read the current video time.
- It can manually accept valid timestamps.
- It can fill start/end fields using the current video time.
- It loops the video between the selected start and end timestamps.
- It can stop looping.
- It rejects invalid timestamp input.
- It rejects timestamps outside the video duration.
- It rejects intervals where the start time is greater than or equal to the end time.
- It shows understandable error messages.
- It uses a Chrome Web Store-compatible Manifest V3 structure.

---

## Non-Goals for the First Version

The first version does not need to include:

- User accounts.
- Cloud sync.
- Multiple saved loops.
- Keyboard shortcuts.
- Loop sharing links.
- Support for websites other than YouTube.
- Advanced playlist support.
- Automatic transcript integration.

These can be added later after the core extension works.

---

## Future Improvements

Possible future features:

- Save multiple loop intervals per video.
- Add keyboard shortcuts to set start and end times.
- Show an overlay on the YouTube page.
- Add a small timeline marker for the loop region.
- Export/import loop intervals.
- Add support for YouTube Shorts.
- Add support for playback speed presets.
- Add a repeat counter.
- Add a notification when the loop starts or stops.

---

## Development Notes

When implementing the extension:

- Keep permissions minimal.
- Use clear function names.
- Separate UI logic from YouTube video control logic.
- Validate timestamps before enabling the loop.
- Avoid modifying YouTube’s page structure unless necessary.
- Test with short and long videos.
- Test timestamps near the beginning and near the end of a video.
- Test invalid inputs carefully.
- Make sure the extension does not create multiple event listeners after repeated use.

---

## Recommended Naming

Possible extension names:

- YouTube Interval Looper
- LoopTube Segment
- YouTube Segment Repeater
- ClipLoop for YouTube
- YouTube A-B Looper

Recommended working name:

```text
YouTube Interval Looper
```

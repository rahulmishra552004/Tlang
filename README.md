# Tlang

A Manifest V3 Chrome extension that reads YouTube captions aloud using the browser’s speech synthesis. The popup uses a compact cream and sage design with a voice dubbing switch.

## Run locally

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose this repository’s folder.
3. Open or refresh a YouTube video with captions available.
4. Open Tlang from the extension toolbar to turn voice dubbing on or off.

After changing extension files, reload the extension and refresh existing YouTube tabs so the updated content script runs.

## Current behavior

- Dubbing defaults to enabled for each newly loaded YouTube document. The setting is kept in the content script, separately for each tab; it is not saved across page reloads.
- The popup queries the active tab with `GET_DUBBING` when opened and sends `SET_DUBBING` with an `enable` boolean when toggled. The switch is disabled while requests are pending.
- The content script runs on `https://www.youtube.com/*` and uses the URL’s `v` parameter to identify the video. Navigation between videos resets speech and listeners, then starts the new video if dubbing is enabled.
- Video pause and buffering pause speech; playback resumes it. Seeking cancels queued speech and resets the current caption.
- Each caption utterance is queued through `SpeechSynthesisUtterance`. When speech is already active, newly queued utterances use `rate = 1 + 0.1 × unfinished utterances` to help catch up. This does not change the rate of utterances already queued.
- The unfinished count includes both speaking and waiting utterances. Completion and error handlers decrement it; a speech generation counter prevents callbacks from canceled batches changing a reset count.
- Initialization counters prevent outdated runs from attaching video listeners or clearing the state of newer runs after failure.

## Caption capture and storage

1. Read the video ID and check local storage under `subtitles:<videoId>:en`.
2. Reuse a matching `/api/timedtext` resource entry from the Performance API if available.
3. Otherwise, observe resource entries, wait for initial video data, and toggle the CC button twice while preserving its original state.
4. Fetch the captured URL as-is. Despite the `fetchVTT` name, the formatter expects YouTube JSON3 data; the current code does not rewrite `fmt`, `lang`, or `tlang`.
5. Build a timeline from event start times and segment offsets, then group segments at ending `.`, `?`, or `!` punctuation.
6. Store formatted captions with the video ID and save time, then attach playback listeners.

The Performance API exposes the request URL and timing metadata, not its response body. The current implementation makes a separate fetch for uncached captions. Main-world response capture remains a proposed alternative.

## Limitations

- Caption capture depends on YouTube’s undocumented request structure and player DOM.
- The formatter works best with segment offsets. Tracks containing large text blocks without offsets can produce long utterances with poor synchronization. An event-level fallback is not implemented.
- The captured response must be JSON3. Other formats, empty responses, or missing caption data can fail parsing or formatting.
- Translation and language selection are not implemented. The `:en` storage suffix does not guarantee the captured source track is English.
- Saving a transcript currently clears all extension local storage first, so only the latest saved transcript remains.
- Popup failures are logged to the popup console; there is no visible error message. Opening the popup on an unsupported page cannot reach a content script.
- Speech speed depends on the installed voice. Backlog-based rate adjustments are a heuristic, not exact synchronization with video playback.
- Side panel, export, response-body capture, and automatic rate-limit handling remain planned work.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension registration, content script, popup, and permissions |
| `content.js` | Caption capture, formatting, storage, navigation, and speech playback |
| `popup.js` | Active-tab messaging and switch state |
| `tlang.html`, `popup.css` | Popup markup and styling |
| `service-worker.js` | Installation logging and diagnostic greeting messages |

## Manual checks

- Open a captioned video and confirm speech starts with playback.
- Toggle dubbing off, reopen the popup, and confirm it still shows off.
- Re-enable dubbing, pause/resume, and seek; confirm canceled speech does not continue.
- Navigate to another video and verify the enabled preference is preserved.
- Toggle quickly or navigate while captions load; confirm outdated initialization does not take over.
- Check both supported segment-offset tracks and tracks without offsets.

The notes below preserve earlier experiments and proposals. They describe historical observations, not necessarily the current implementation.

## Historical investigation: Phase 1 (2026-11-08)

**Environment:** Chrome 156 on Windows 10, YouTube web client `cver=2.20261105.05.01`, as reported in the URL. Tested on video `2cNDbjPECKw` (Japanese auto-generated captions: `lang=ja`, `kind=asr`), translated with `tlang=hi`.

### The caption request
- The player requests captions from `https://www.youtube.com/api/timedtext?...`. Filter the Network panel by `timedtext` to find it.
- **No request is made while CC is off.** With CC off, a page reload with Preserve log on showed no `timedtext` request.
- **Turning CC off and on makes a new request.**

### The URL
- **There is no `pot` parameter.**
- **The URL is signed.** It includes `signature`, `expire` (a Unix timestamp), and `sparams=ip,ipbits,expire,v,ei,caps,opi,xoaf`. `sparams` appears to list the parameters the signature covers.
- `ip=0.0.0.0&ipbits=0`: the URL doesn't appear to be tied to an IP address.
- **It works signed out**, in an Incognito window.

### What can and can't be changed

| Change | Result |
|---|---|
| Set `fmt=vtt` and add `tlang=hi` | ✅ `200`, translated WebVTT |
| Smallest URL: only `v`, `lang`, `kind`, `fmt`, `tlang` (no signature) | ❌ `404` |
| Change `v` to another video ID | ❌ `404` |
| Change one character of `signature` | ❌ `404` |
| Remove `lang` or `kind` | ❌ fails (status not recorded) |
| Change `lang` to another track | ❌ `200` with an **empty body** (`0.0 kB`, Type `text/html`) |

### Reading the Network rows
- Opening a youtube.com URL in a tab shows two rows per load. YouTube's own **web** service worker (not the extension's) handles the tab's request: Size shows `(ServiceWorker)`. A second row marked ⚙ (Initiator `Preload`) is that service worker's real request to the server. Read the ⚙ row for the true response size.

### Format choice: `fmt=vtt`, not `json3`
- WebVTT is a documented standard: https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API
- The browser can parse it (`TextTrack.cues`, `VTTCue`), and Phase 7 can export it as `.vtt` with no conversion.
- `json3` is YouTube's own undocumented format.

## Historical design decisions and planned work

- **Phase 3: capture, don't build.** The URL can't be built by hand or reused for another video, so the extension must identify the player's own signed URL for the current video:
  1. Look in the requests already recorded (`getEntriesByType`) for a `timedtext` URL whose `v=` matches the current video.
  2. If there isn't one, wait for one with `PerformanceObserver`.
  3. If none arrives, toggle CC to force a request: on if it was off, or off and on again if it was on. **This is needed on every video that loads with CC off.**
  4. If CC was off before, turn it off again after capturing.
  - Ignore URLs for other videos. Since the signature covers `v`, an old URL can't be fixed by editing it.
- **One captured URL is one source track.** To get a different source track, choose it in the player's CC menu and capture the new URL. Any target language works from the same URL via `tlang`.
- **Current Phase 4 prototype: change only `fmt` and `tlang`.** Don't touch anything listed in `sparams`. After fetching, check **both**:
  - `response.ok`, which catches the `404` cases;
  - that the text isn't empty and has cues, which catches the empty `200` case that `response.ok` misses.
- **Preferred Phase 4 revision: capture YouTube's existing response body.** Run a small script in the page's `MAIN` world at `document_start`, wrap `fetch` (and `XMLHttpRequest` if necessary), clone matching responses, and send the body through `window.postMessage` to an `ISOLATED` content script. The isolated script validates the message and stores the data. This avoids the manual second request and reduces the chance of `429 Too Many Requests`.
  - The captured body uses the format YouTube requested, usually undocumented `json3` rather than VTT.
  - Convert captured JSON3 locally if VTT is required; do not refetch solely to change formats.
  - Keep extension APIs and storage in the isolated script. Code in `MAIN` shares the page's JavaScript environment and can be observed or modified by the page.
- **Phase 5:** handle both timestamp formats (`mm:ss.ttt` and `hh:mm:ss.ttt`), and strip in-cue tags such as `<00:00:01.234>` and `<c>` if they appear.
- **Phase 7:** save the transcript text in `storage.local`, never the caption URL. URLs are signed and have an `expire` time. Use a stable key such as `subtitles:<videoId>:<language>` and check it before clicking or fetching.
- **Phase 8, first failure messages:** `404` → "Couldn't load captions"; empty `200` → "No captions in this track".

### Request-count and rate-limit rules

- One uncached run of the current prototype can cause two timed-text requests: one when CC turns on and another from the manual VTT fetch.
- Check storage first, then reuse an existing performance entry before toggling CC.
- Start the observer before the action that can produce the request.
- Do not retry `429` responses automatically. Honor `Retry-After` when present and allow the rate limit to reset.
- A failed fetch is not cached, so repeatedly reloading the extension or page repeats the full request flow.

## Open questions
- [ ] **Expiry:** does a captured URL stop working after its `expire` time? If it gives `404`, that's a third failure case.
- [ ] Do `signature`, `expire` and `ei` change when CC is toggled off and on, or does the player reuse the same URL?
- [ ] When changing `lang` gave an empty body, was `kind=asr` kept? A mismatch with an uploaded (non-auto) track might be the cause.
- [ ] VTT details in YouTube's response: anything after `WEBVTT` on the first line, which timestamp format is used, cue settings such as `align:start`, and `<...>` tags in the text, especially on auto-generated captions.
- [ ] Does YouTube request timed text with `fetch` or `XMLHttpRequest` in every player configuration? The main-world response capture must support whichever mechanism is used.
- [ ] Define and test a local JSON3-to-VTT conversion so response capture does not require another network request.

## Redacted caption URL shape

Never commit a complete signed caption URL, cookies, identity tokens, or request headers. A safe example is:

```text
https://www.youtube.com/api/timedtext?v=<video-id>&expire=<timestamp>&signature=<redacted>&lang=<source-language>&fmt=<format>&tlang=<target-language>
```

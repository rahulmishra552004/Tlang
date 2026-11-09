# Tlang

Manifest V3 Chrome extension for YouTube transcript translation.

Tlang captures the caption request for the current YouTube video, obtains the transcript, and stores it locally for later translation, display, or export. The current prototype captures the signed caption URL with the Performance API and makes a second request with `fmt=vtt` and `tlang=<language code>`. A planned response-capture path will instead clone YouTube's original response in the page's main JavaScript world, avoiding that extra request.

> **Note:** nothing below is documented by YouTube. These are observations from Chrome DevTools, and YouTube can change any of them without notice. Re-run the Phase 1 tests if something stops working.

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Extension basics (6 lessons + final exercise) | Lessons 1, 3, 4, 5 and 6 built; Lesson 2 (Broken Color sample) and the final exercise not done yet |
| 1 | Do it by hand in DevTools | Done (open questions below) |
| 2 | Content script on watch pages | In progress |
| 3 | Capture the signed caption URL | Prototype implemented with `performance.getEntriesByType()` and `PerformanceObserver` |
| 4 | Obtain and store transcript data | Manual VTT fetch prototype implemented; main-world response capture is the next revision |
| 5 | Turn VTT into lines | Not started |
| 6 | Handle moving to the next video | Not started |
| 7 | Side panel, language choice, export | `storage.local` prototype implemented; UI and export not started |
| 8 | Failures and fallback | Not started |

## Content script findings (Lesson 3, 2026-11-08)

- The current manifest uses `"matches": ["https://www.youtube.com/watch*"]`. The content script therefore **only runs when a watch page is loaded or reloaded directly**. Opening the home page and then clicking a video does **not** run it, because YouTube switches pages without loading a new document.
- **Planned Phase 2 change:** use `"matches": ["https://www.youtube.com/*"]` so the script is always present, and check in code whether the current page is a video (`/watch`).
- **Decision (Phase 6):** since the script runs once per page load, it has to be told when YouTube moves to another video.

## Current prototype flow (2026-11-09)

1. Read the current `v` parameter from the watch-page URL.
2. Check `browser.storage.local` for `subtitles:<videoId>:<language>`.
3. Search existing `resource` performance entries for a matching `/api/timedtext` request.
4. If no entry exists, start a `PerformanceObserver` before triggering CC. The observer Promise may resolve before it is awaited; Promises retain their settled value.
5. Press the CC button twice while preserving its initial on/off state. Wait for the timed-text entry before the click that turns captions back off.
6. Modify only `fmt` and `tlang`, fetch the VTT response, then store its text and metadata in `storage.local`.

The observer is started early because the caption request can occur while the video is loading. If the content script moves to `document_start`, it must wait for the video and CC button with a `MutationObserver`; those elements do not exist yet at that stage.

### Performance API boundary

- `performance.getEntriesByType('resource')` searches resource entries already retained in the page's performance timeline.
- `PerformanceObserver` receives matching entries as the browser records them. `buffered: true` also requests retained earlier entries.
- A `PerformanceResourceTiming` entry exposes the URL as `entry.name` plus timing and size metadata.
- It does **not** expose request headers, response headers, or the response body.
- Entries belong to a specific global context. A request made inside another frame or worker may not appear in the top frame's timeline.

## Phase 1 findings (2026-11-08)

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

## Design decisions from these findings

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

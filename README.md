# Tlang
Chrome extension for Youtube audio translation

Tlang gets a translated transcript of a YouTube video. It takes the caption URL the YouTube player requests, changes `fmt` to `vtt`, and adds `tlang=<language code>`.

> **Note:** nothing below is documented by YouTube. These are observations from Chrome DevTools, and YouTube can change any of them without notice. Re-run the Phase 1 tests if something stops working.

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Extension basics (6 lessons + final exercise) | Lessons 1, 3, 4, 5 built; Lesson 2 (Broken Color sample), Lesson 6 (storage) and the final exercise not done yet |
| 1 | Do it by hand in DevTools | Done (open questions below) |
| 2 | Content script on watch pages | In progress |
| 3 | Capture the signed caption URL | Not started (design below) |
| 4 | Build the translated URL and fetch it | Not started |
| 5 | Turn VTT into lines | Not started |
| 6 | Handle moving to the next video | Not started |
| 7 | Side panel, language choice, export | Not started |
| 8 | Failures and fallback | Not started |

## Content script findings (Lesson 3, 2026-11-08)

- With `"matches": ["https://www.youtube.com/watch*"]`, the content script **only runs when a watch page is loaded or reloaded directly**. Opening the home page and then clicking a video does **not** run it, because YouTube switches pages without loading a new document.
- **Decision (Phase 2):** keep `"matches": ["https://www.youtube.com/*"]` so the script is always present, and check in code whether the current page is a video (`/watch`).
- **Decision (Phase 6):** since the script runs once per page load, it has to be told when YouTube moves to another video.

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

- **Phase 3: capture, don't build.** The URL can't be built by hand or reused for another video, so the content script must take the player's own signed URL for the current video:
  1. Look in the requests already recorded (`getEntriesByType`) for a `timedtext` URL whose `v=` matches the current video.
  2. If there isn't one, wait for one with `PerformanceObserver`.
  3. If none arrives, toggle CC to force a request: on if it was off, or off and on again if it was on. **This is needed on every video that loads with CC off.**
  4. If CC was off before, turn it off again after capturing.
  - Ignore URLs for other videos. Since the signature covers `v`, an old URL can't be fixed by editing it.
- **One captured URL is one source track.** To get a different source track, choose it in the player's CC menu and capture the new URL. Any target language works from the same URL via `tlang`.
- **Phase 4: change only `fmt` and `tlang`.** Don't touch anything listed in `sparams`. After fetching, check **both**:
  - `response.ok`, which catches the `404` cases;
  - that the text isn't empty and has cues, which catches the empty `200` case that `response.ok` misses.
- **Phase 5:** handle both timestamp formats (`mm:ss.ttt` and `hh:mm:ss.ttt`), and strip in-cue tags such as `<00:00:01.234>` and `<c>` if they appear.
- **Phase 7:** save the transcript text in `storage.local`, never the caption URL. URLs are signed and have an `expire` time.
- **Phase 8, first failure messages:** `404` → "Couldn't load captions"; empty `200` → "No captions in this track".

## Open questions
- [ ] **Expiry:** does the example URL below still work after its `expire` time (16:06 UTC, 2026-11-08)? If it gives `404`, that's a third failure case.
- [ ] Do `signature`, `expire` and `ei` change when CC is toggled off and on, or does the player reuse the same URL?
- [ ] When changing `lang` gave an empty body, was `kind=asr` kept? A mismatch with an uploaded (non-auto) track might be the cause.
- [ ] VTT details in YouTube's response: anything after `WEBVTT` on the first line, which timestamp format is used, cue settings such as `align:start`, and `<...>` tags in the text, especially on auto-generated captions.
- [ ] Does a content script's `fetch()` get the same results as the address bar? Phase 4 will tell.

## Example captured URL
Signed; expires 16:06 UTC, 2026-11-08. Used for the expiry test. Delete it before pushing this repo anywhere public.

https://www.youtube.com/api/timedtext?v=2cNDbjPECKw&ei=ijvwao7pH4Wt9fwPuIHtgAs&caps=asr&opi=112496729&xoaf=5&xowf=1&xospf=1&hl=en&ip=0.0.0.0&ipbits=0&expire=1794153978&sparams=ip%2Cipbits%2Cexpire%2Cv%2Cei%2Ccaps%2Copi%2Cxoaf&signature=6B679B28ABB80EBB9DFD26AEB10C99CF5A200778.7BE7B06BDED4574B29E4FFE8EB5DB9FD0CC4436D&key=yt8&kind=asr&lang=ja&fmt=vtt&xorb=2&xobt=3&xovt=3&cbr=Chrome&cbrver=156.0.0.0&c=WEB&cver=2.20261105.05.01&cplayer=UNIPLAYER&cos=Windows&cosver=10.0&cplatform=DESKTOP&tlang=hi

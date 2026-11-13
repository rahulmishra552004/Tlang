const tlang = {
  getCCButtonState,
  clickCCButtonTwiceAndGetEntry,
  waitForClick,
  getDataFromStorage,
  waitForInitialRender,
  waitForTimedTextEntry,
  storeData,
  fetchVTT,
  findTimedTextEntry,
  formatTimedText,
  currentTimeIn,
  getPeriod,
  handleTimeUpdate,
  speak,
  waitForPlayerElements,
  getVTT,
  addVideoEventListeners,
  main,
}

const tlangGreeting = 'hi from tlang';
console.log('[Tlang] content script running on', location.href);

(async() => {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'hello',
      url: location.href,
    });
    console.log('[tlang] reply from service worker:', response);
  } catch (error) {
    console.log('[tlang] sendMessage failde:', error);
  }
})();

function getCCButtonState(button) {
  return button.getAttribute('aria-pressed') === 'true';
}

async function clickCCButtonTwiceAndGetEntry(button, entryPromise) {
  const initialState = getCCButtonState(button);
  const stateAfterClick = !initialState;

  if (initialState) {
    const firstClick = waitForClick(button, stateAfterClick);
    button.click();
    await firstClick;

    const secondClick = waitForClick(button, initialState);
    button.click();
    const [, entry] = await Promise.all([
      secondClick,
      entryPromise
    ]);

    return entry;
  } else {
    const firstClick = waitForClick(button, stateAfterClick);
    button.click();
    const [, entry] = await Promise.all([
      firstClick,
      entryPromise,
    ]);
    const secondClick = waitForClick(button, initialState);
    button.click();
    await secondClick;

    return entry;
  }
}

function waitForClick(button, expectedState, timeout = 3000) {
  return new Promise((resolve, reject) => {
    if (getCCButtonState(button) === expectedState) {
      resolve();
      return;
    }
    const stateObserver = new MutationObserver(() => {
      if (getCCButtonState(button) === expectedState) {
        clearTimeout(timer);
        stateObserver.disconnect();
        resolve();
      }
    });

    stateObserver.observe(button, {
      attributes: true,
      attributeFilter: ['aria-pressed'],
    });

    const timer = setTimeout(() => {
      stateObserver.disconnect();
      reject(new Error('[tlang] CC button state did not change'))
    }, timeout);
  });
}

async function getDataFromStorage(videoId) {
  const key = `subtitles:${videoId}:en`;
  const data = await browser.storage.local.get(key);
  if (Object.hasOwn(data, key)) {
    return data[key];
  } else {
    return null;
  }
}

function waitForInitialRender(video, timeout=30000) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }

    let timer;

    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', handleLoaded);
      video.removeEventListener('error', handleError);
    }

    function handleLoaded() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error('[tlang] video failed to load'));
    }

    video.addEventListener('loadeddata', handleLoaded, {once: true});
    video.addEventListener('error', handleError, {once: true});

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('[tlang] initial video data timeout'));
    }, timeout);
  });
}

function waitForTimedTextEntry(videoId, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const urlPrefix = 'https://www.youtube.com/api/timedtext';
    let timer;

    const resourceObserver = new PerformanceObserver((list, resourceObserver) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        const url = new URL(entry.name);
        const matchUrl = entry.name.startsWith(urlPrefix);
        const matchVideoId = url.searchParams.get('v') === videoId;
        if (matchUrl && matchVideoId) {
          clearTimeout(timer);
          resourceObserver.disconnect();
          resolve(entry);
          return ;
        }
      }
    });

    resourceObserver.observe({
      type: 'resource',
      buffered: true,
    });

    timer = setTimeout(() => {
      resourceObserver.disconnect();
      reject(new Error('[tlang] timed text entry request timed out'));
    }, timeout);
  });
}

async function storeData(videoId, data) {
  const storageKey = `subtitles:${videoId}:en`
  await browser.storage.local.clear();
  await browser.storage.local.set({
    [storageKey]: {
      videoId,
      text: data,
      savedAt: Date.now()
    }
  });
  return;
}

async function fetchVTT(entry) {
  const url = new URL(entry.name);

  const videoId = url.searchParams.get('v');

  const response = await fetch(url);
  if(!response.ok) {
    throw new Error(
      `[tlang] subtitle fetch failed: HTTP ${response.status}`
    );
  }
  const subtitleText = await response.text();
  return subtitleText;
}

function findTimedTextEntry(videoId) {
  return performance
    .getEntriesByType('resource')
    .find((entry) => {
      const url = new URL(entry.name);
      return (
        url.pathname === '/api/timedtext' &&
        url.searchParams.get('v') === videoId
      );
    });
}

function formatTimedText(data) {
  const parsed = typeof(data) === 'string' ? JSON.parse(data) : data;

  const captions = [];
  const wordsTimeline = [];

  for (const event of parsed.events) {
    if (!Object.hasOwn(event, 'segs')) continue;

    const tStartMs = event.tStartMs;
    let firstSegment = true;

    for (const seg of event.segs) {
      const text = seg.utf8;

      if (!text.trim()) continue;

      wordsTimeline.push({
        text: firstSegment ? ' ' + text : text,
        'time': tStartMs + (seg.tOffsetMs ?? 0),
      });
      firstSegment = false;
    }
  }

  const lastEvent = parsed.events.at(-1);
  const transcriptEndMs = lastEvent.tStartMs + lastEvent.dDurationMs;

  let i = 0;
  while (i < wordsTimeline.length) {
    const parts = [];
    const startTimeMs = wordsTimeline[i].time;

    while(i < wordsTimeline.length) {
      const segment = wordsTimeline[i];
      parts.push(segment.text);
      i++;

      if (
        segment.text.trimEnd().endsWith('.')
        ||segment.text.trimEnd().endsWith('?')
        ||segment.text.trimEnd().endsWith('!')
      ) {
        break;
      }
    }

    const endTimeMs = wordsTimeline[i]?.time ?? transcriptEndMs;

    const text = parts.join('')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .trim();
    captions.push({
      text,
      startTimeMs,
      endTimeMs,
    });
  }

  return captions;
}

function waitForPlayerElements(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const playerObserver = new MutationObserver(check);

    const timer = setTimeout(() => {
      playerObserver.disconnect();
      reject(new Error('[tlang] Timed out waiting for video player'));
    }, timeout);

    function check() {
      const video = document.querySelector('video.html5-main-video');
      const button = document.querySelector('.ytp-subtitles-button');

      if (video && button) {
        clearTimeout(timer);
        playerObserver.disconnect();
        resolve({video, button});
      }
    }

    playerObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    check();
  });
}

async function getVTT() {
  const pageUrl = new URL(location.href);
  const videoId = pageUrl.searchParams.get('v');

  const storedData = await getDataFromStorage(videoId);
  if (storedData) {
    return storedData.text;
  }

  const video = document.querySelector('video.html5-main-video');
  const button = document.querySelector('.ytp-subtitles-button');

  if (!video) throw new Error('video not found');
  if (!button) throw new Error('CC button not found');

  let entry = findTimedTextEntry(videoId);

  if (!entry) {
    const entryPromise = waitForTimedTextEntry(videoId);

    await waitForInitialRender(video);
    entry = await clickCCButtonTwiceAndGetEntry(button, entryPromise);
  }

  const rawData = await fetchVTT(entry);
  const formattedData = formatTimedText(rawData);
  await storeData(videoId, formattedData);
  return formattedData;
}

function currentTimeIn(currentTimeMs, period) {
  if (!period) return false;

  if (currentTimeMs >= period.startTimeMs
    && currentTimeMs < period.endTimeMs) {
    return true;
  } else {
    return false
  }
}

function getPeriod(captions, currentTimeMs) {
  const n = captions.length;
  let low = 0;
  let high = n-1;

  let ans;
  while (low <= high) {
    const mid = Math.floor((low+high)/2);
    // Include the caption already active at the current playback time.
    if (currentTimeMs < captions[mid].endTimeMs) {
      ans = mid;
      high = mid-1;
    } else {
      low = mid+1;
    }
  }
  return captions[ans];
}

function handleTimeUpdate(event, captions) {
  const currentTimeMs = event.currentTarget.currentTime*1000;
  const video = event.currentTarget;

  if (video.paused) return;

  const period = getPeriod(captions, currentTimeMs);
  if ( !period || period === currentPeriod) return;

  currentPeriod = period;
  console.log('next text: ', currentPeriod.text);
  speak(currentPeriod.text);
}

function speak(text) {
  const generation = speechGeneration;
  const cleanup = () => {
    if (generation === speechGeneration) sentencesQueued--;
  };

  const synth = window.speechSynthesis;

  const sentence = new SpeechSynthesisUtterance(text);
  sentence.volume = volume;
  sentence.pitch = pitch;
  sentence.onend = cleanup;
  sentence.onerror = (event) => {
    console.log('[tlang] speech error: ', event.error);
    cleanup();
  }

  if (synth.speaking && !synth.paused) {
    sentence.rate = Math.min(1 + (0.2)*sentencesQueued, 2);
  }

  synth.speak(sentence);
  sentencesQueued++;
  // Resume after enqueueing to avoid silent speech on page startup.
  synth.resume();
}

function addVideoEventListeners(video, captions) {
  videoListenerController?.abort();

  videoListenerController = new AbortController();
  const options = { signal: videoListenerController.signal };

  video.addEventListener('timeupdate', (event) => {
    handleTimeUpdate(event, captions);
  }, options);

  video.addEventListener('pause', () => {
    window.speechSynthesis.pause()
  }, options);

  video.addEventListener('waiting', () => {
    window.speechSynthesis.pause()
  }, options);

  video.addEventListener('playing', () => {
    window.speechSynthesis.resume();
  }, options);

  video.addEventListener('seeking', () => {
    speechGeneration++;
    window.speechSynthesis.cancel();
    sentencesQueued = 0
    currentPeriod = null;
  }, options);

  video.addEventListener('seeked', () => {
    if(!video.paused) {
      handleTimeUpdate({ 'currentTarget': video }, captions);
    }
  }, options);

}

function reset() {
  const videoId = new URL(location.href).searchParams.get('v');
  videoListenerController?.abort();
  currentPeriod = null;
  speechGeneration++;
  window.speechSynthesis.cancel();
  sentencesQueued = 0
  previousVideoId = videoId;
}

async function main() {
  const currDubbingEnableReqCnt = dubbingEnableReqCnt;
  const videoId = new URL(location.href).searchParams.get('v');
  if (!videoId) return;

  try {
    await waitForPlayerElements();
  } catch (error) {
    console.log('[tlang] error: ', error);
    throw new Error(error);
  }

  if (new URL(location.href).searchParams.get('v') != videoId) return;

  let captions;
  try {
    captions = await getVTT();
    console.log('[tlang] captions captured');
    console.log(captions);
  } catch (error) {
    console.log('[tlang] error: ', error);
    throw new Error(error);
  }

  //rejecting outdated captions from previous video
  if (new URL(location.href).searchParams.get('v') != videoId) return;

  const video = document.querySelector('video.html5-main-video');
  if (!video) {
    console.log('[tlang] video element not found');
  } else {
    if (!DUBBING || currDubbingEnableReqCnt != dubbingEnableReqCnt) return;
    addVideoEventListeners(video, captions);
  }
}

let currentPeriod = null;

let DUBBING = true;
let dubbingEnableReqCnt = 0;

let volume = 1;
let pitch = 1;

let sentencesQueued = 0;
let speechGeneration = 0;

let videoListenerController = null;
let previousVideoId = new URL(location.href).searchParams.get('v');

window.navigation.addEventListener('currententrychange', () => {
  const videoId = new URL(location.href).searchParams.get('v');
  if (previousVideoId != videoId) {
    reset();
    if (DUBBING) {
      dubbingEnableReqCnt++;
      const currDubbingEnableReqCnt = dubbingEnableReqCnt;
      main()
        .catch(error => {
          if (currDubbingEnableReqCnt === dubbingEnableReqCnt) DUBBING = false;
          console.log('[tlang] error: ', error.message);
        });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_DUBBING') {
    if (message.enable === true && DUBBING === false) {
      dubbingEnableReqCnt++;
      const currDubbingEnableReqCnt = dubbingEnableReqCnt;
      DUBBING = true;
      main()
        .then(() => sendResponse({ DUBBING }))
        .catch((error) => {
          if (currDubbingEnableReqCnt === dubbingEnableReqCnt) DUBBING = false;
          sendResponse({ 'error' : error.message })
        });
      return true;

    } else if (message.enable === false && DUBBING === true) {
      reset();
      DUBBING = false;
    }
    sendResponse({ DUBBING });
    return;
  }

  if(message.type === 'GET_DUBBING') {
    sendResponse({ DUBBING });
    return;
  }

  if(message.type === 'SET_VOLUME') {
    volume = message.value;
    return;
  }

  if(message.type === 'SET_PITCH') {
    pitch = message.value;
    return;
  }

  if(message.type === 'GET_VOLUME') {
    sendResponse({ volume });
    return;
  }

  if(message.type === 'GET_PITCH') {
    sendResponse({ pitch });
    return;
  }
});

const currDubbingEnableReqCnt = dubbingEnableReqCnt;
main()
  .catch(error => {
    if (currDubbingEnableReqCnt === dubbingEnableReqCnt) DUBBING = false;
    console.log('[tlang] error: ', error.message);
  });


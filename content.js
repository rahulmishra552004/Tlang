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
  getNextPeriod,
  handleTimeUpdate,
  getVTT,
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

  url.searchParams.set('fmt', 'json3');
  url.searchParams.set('tlang', 'en');

  const videoId = url.searchParams.get('v');
  const language = 'en';

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

  for (const event of parsed.events) {
    if (!event.segs) continue;

    const text = event.segs
      .map((seg) => seg.utf8 ?? ' ')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) continue;
    captions.push({
      text,
      startTimeMs: event.tStartMs,
      endTimeMs: event.tStartMs+event.dDurationMs
    });
  }

  return captions;
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

function getNextPeriod(captions, currentTimeMs) {
  const n = captions.length;
  let low = 0;
  let high = n-1;

  let ans;
  while (low <= high) {
    const mid = Math.floor((low+high)/2);
    if (currentTimeMs <= captions[mid].startTimeMs) {
      ans = mid;
      high = mid-1;
    } else if (currentTimeMs > captions[mid].startTimeMs) {
      low = mid+1;
    }
  }
  return captions[ans];
}

function handleTimeUpdate(event, captions) {
  const currentTimeMs = event.currentTarget.currentTime*1000;
  console.log('currentTimeMs: ', currentTimeMs);
  console.log('currentPeriod: ', currentPeriod?.startTimeMs);
  console.log('nextPeriod: ', nextPeriod?.startTimeMs);

  if (!currentTimeIn(currentTimeMs, currentPeriod)
    && !currentTimeIn(currentTimeMs, nextPeriod)) {
    nextPeriod = getNextPeriod(captions, currentTimeMs);

  } else if (!currentTimeIn(currentTimeMs, currentPeriod)
    && currentTimeIn(currentTimeMs, nextPeriod)) {
    console.log('next text: ', nextPeriod.text);
    const sentence = new SpeechSynthesisUtterance(nextPeriod.text);
    window.speechSynthesis.speak(sentence);
    currentPeriod = nextPeriod;
    nextPeriod = getNextPeriod(captions, currentTimeMs);

  } else {
    return;
  }
}

async function main() {
  let captions;
  try {
    captions = await getVTT();
    console.log('[tlang] captions captured');
    console.log(captions);
  } catch (error) {
    console.log('[tlang] error: ', error);
    throw new Error(error);
  }

  const video = document.querySelector('video.html5-main-video');
  if (!video) {
    console.log('[tlang] video element not found');
  } else {
    video.addEventListener('timeupdate', (event) => {
      handleTimeUpdate(event, captions);
    });
  }
}

let currentPeriod = null;
let nextPeriod = null;

main();


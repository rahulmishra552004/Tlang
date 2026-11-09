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

const urlPrefix = 'https://www.youtube.com/api/timedtext';
const resourceObserver = new PerformanceObserver(async (list, resourceObserver) => {
  const entries = list.getEntries();
  for (const entry of entries) {
    const matchUrl = entry.name.startsWith(urlPrefix);
    if (matchUrl) {
      resourceObserver.disconnect();
      const url = new URL(entry.name);
      console.log('[tlang]', url);
      const params = url.searchParams;
      params.set('fmt', 'vtt');
      params.set('tlang', 'en');
      console.log('[tlang]', url);
      const response = await fetch(url);
      data = await response.text();
      console.log(data);
    }
  }
});

function getCCButtonState() {
  const isPressed = button.getAttribute('aria-pressed') === 'true';
  if (isPressed) {
    console.log('[tlang] cc is on');
  } else {
    console.log('[tlang] cc is off');
  }
  return isPressed;
}

async function clickCCButtonTwice() {
  if (!button) {
    console.log('[tlang] no button');
  } else {
    console.log('[tlang] clicking CC button twice');
  }
  const initialState = getCCButtonState();
  const stateAfterClick = !initialState;

  const firstClick = waitForClick(stateAfterClick);
  button.click();
  await firstClick;

  const secondClick = waitForClick(initialState);
  button.click();
  await secondClick;
  console.log('[tlang] button was clicked twice');
}

function waitForClick(expectedState, timeout = 3000) {
  return new Promise((resolve, reject) => {
    if (getCCButtonState() === expectedState) {
      resolve();
      return;
    }
    const stateObserver = new MutationObserver(() => {
      if (getCCButtonState() === expectedState) {
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

const button = document.querySelector('.ytp-subtitles-button');
button.addEventListener('click', () => {
  console.log('[tlang] cc button cicked');
})

resourceObserver.observe({
  'type': 'resource',
  'buffered': true,
});
setTimeout(() => {
  clickCCButtonTwice();
  }, 4000);
//clickCCButtonTwice();

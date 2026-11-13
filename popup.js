async function setDubbing(enabled) {
  dubbingSwitch.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      'type': 'SET_DUBBING',
      'enable': enabled,
    });

    if (response.error) {
      throw new Error(response.error);
    }
    dubbingSwitch.checked = response.DUBBING;
    console.log('content script response: ', response);
  } catch (error) {
    dubbingSwitch.checked = !dubbingSwitch.checked;
    console.log('could not update dubbing: ', error.message);
  } finally {
    dubbingSwitch.disabled = false;
  }
}

async function getDubbing() {
  dubbingSwitch.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      'type': 'GET_DUBBING',
    });

    dubbingSwitch.checked = response.DUBBING;
  } catch (error) {
    console.log('could not get dubbing: ', error.message);
  } finally {
    dubbingSwitch.disabled = false;
  }
}

async function setVolume(value) {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      'type': 'SET_VOLUME',
      value,
    });
  } catch (error) {
    console.log('could not change volume: ', error.message);
  }
}

async function setPitch(value) {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      'type': 'SET_PITCH',
      value,
    });
  } catch (error) {
    console.log('could not change pitch: ', error.message);
  }
}

async function getPitch() {
  pitchSlider.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      'type': 'GET_PITCH'
    });

    pitchSlider.value = response.pitch;
  } catch (error) {
    console.log('could not get pitch: ', error.message);
  } finally {
    pitchSlider.disabled = false;
  }
}

async function getVolume() {
  volumeSlider.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      'type': 'GET_VOLUME'
    });

    volumeSlider.value = response.volume;
  } catch (error) {
    console.log('could not get volume: ', error.message);
  } finally {
    volumeSlider.disabled = false;
  }
}

const dubbingSwitch = document.querySelector('.switch input[type="checkbox"]');
dubbingSwitch.addEventListener('change', (event) => {
  setDubbing(event.target.checked);
});

const volumeSlider = document.querySelector('#volume-slider');
volumeSlider.addEventListener('change', (event) => {
  setVolume(Number(event.target.value));
});

const pitchSlider = document.querySelector('#pitch-slider');
pitchSlider.addEventListener('change', (event) => {
  setPitch(Number(event.target.value));
});

getDubbing();
getVolume();
getPitch();



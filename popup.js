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

async function getVoices() {
  voiceSelect.disabled = true;
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await browser.tabs.sendMessage(tab.id, {
      'type': 'GET_VOICES',
    });

    voiceSelect.replaceChildren();
    voiceSelect.add(new Option('Default voice', ''));
    for (const voice of response.voices) {
      voiceSelect.add(new Option(voice.name, voice.voiceURI));
    }
  } catch (error) {
    console.log('could not load voices: ', error.message);
  } finally {
    voiceSelect.disabled = false;
  }
}

async function setVoice(value) {
  voiceSelect.disabled = true;
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await browser.tabs.sendMessage(tab.id, {
      type: 'SET_VOICE',
      value: value,
    });

  } catch (error) {
    console.log('could not set voice: ', error.message);
  } finally {
    voiceSelect.disabled = false;
  }
}

async function getSelectedVoice() {
  voiceSelect.disabled = true;
  try{
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await browser.tabs.sendMessage(tab.id, {
      'type': 'GET_SELECTED_VOICE',
    });
    voiceSelect.value = response.voiceURI ?? '';
  } catch (error) {
    console.log('could not get selected voice: ', error.message);
  } finally {
    voiceSelect.disabled = false;
  }
}

async function getAvailableLanguages() {
  languageSelect.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const languages = await chrome.runtime.sendMessage({
      'type': 'GET_AVAILABLE_LANGUAGES',
      'tabId': tab.id,
      'videoId': new URL(tab.url).searchParams.get('v')
    });

    if(!languages) throw new Error('No language in response');
    if(languages.error) throw new Error(languages.error);

    languageSelect.replaceChildren();
    languageSelect.add(new Option('Default (en)', 'en'));
    for(const language of languages) {
      languageSelect.add(new Option(language.name, language.code));
    }
  } catch (error) {
    console.log('[tlang] could not get available languages: ', error.message);
  } finally {
    languageSelect.disabled = false;
  }
}

async function setLanguage(value) {
  languageSelect.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    await chrome.tabs.sendMessage(tab.id, {
      'type': 'SET_LANGUAGE',
      value,
    });
  } catch (error) {
    console.log('could now set language: ', error.message);
  } finally {
    languageSelect.disabled = false;
  }
}

async function getSelectedLanguage() {
  const response = await browser.storage.local.get('selectedLanguage');
  languageSelect.value = response.selectedLanguage ?? 'en';
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

const voiceSelect = document.querySelector('#voice-select');
voiceSelect.addEventListener('change', (event) => {
  setVoice(event.target.value);
});

const languageSelect = document.querySelector('#language-select');
languageSelect.addEventListener('change', (event) => {
  setLanguage(event.target.value);
});

getDubbing();
getVolume();
getPitch();
getVoices().then(() => getSelectedVoice());
getAvailableLanguages().then(() => getSelectedLanguage());



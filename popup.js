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

const dubbingSwitch = document.querySelector('.switch input[type="checkbox"]');
dubbingSwitch.addEventListener('change', (event) => {
  setDubbing(event.target.checked);
});
getDubbing();



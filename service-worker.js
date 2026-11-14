browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'GET_CAPTION_TRACKS') return;
  chrome.scripting.executeScript({
    target: { tabId: sender.tab.id },
    world: 'MAIN',
    func: async (expectedVideoId) => {
      const deadline = Date.now() + 15000;

      while(Date.now() < deadline){
        const response = document.querySelector('#movie_player')
          ?.getPlayerResponse?.();

        const captions = response
          ?.captions?.playerCaptionsTracklistRenderer ?? null;

        if(response?.videoDetails?.videoId === expectedVideoId && captions) {
          return captions;
        };

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      throw new Error(
        '[tlang] Timed out waiting for current video captions metadata'
      );
    },
    args: [message.videoId],
  }).then(([result]) => sendResponse(result.result))
    .catch(error => sendResponse({ 'error': error.message }));

  return true;
});

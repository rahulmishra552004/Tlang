browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'GET_CAPTION_TRACKS'
      && message.type !== 'GET_AVAILABLE_LANGUAGES') return;

  chrome.scripting.executeScript({
    target: { tabId: sender.tab?.id ?? message.tabId },
    world: 'MAIN',
    func: async (expectedVideoId, type) => {
      const deadline = Date.now() + 15000;

      while(Date.now() < deadline){
        const response = document.querySelector('#movie_player')
          ?.getPlayerResponse?.();

        const captions = response
          ?.captions?.playerCaptionsTracklistRenderer ?? null;

        if(type === 'GET_CAPTION_TRACKS'
          && response?.videoDetails?.videoId === expectedVideoId
          && captions) {
          return captions;
        };

        if(type === 'GET_AVAILABLE_LANGUAGES'
          && response?.videoDetails?.videoId === expectedVideoId
          && captions) {

          const getName = name =>
            name?.simpleText ?? name?.runs?.map(run => run.text).join('');

          const languages = [...new Map([
            ...(captions?.captionTracks ?? []).map(t => [
              t.languageCode,
              { code: t.languageCode, name: getName(t.name) ?? t.languageCode },
            ]),
            ...(captions?.translationLanguages ?? []).map(t => [
              t.languageCode,
              { code: t.languageCode, name: getName(t.languageName) ?? t.languageCode },
            ]),
          ]).values()];

          return languages;
       };

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      throw new Error(
        '[tlang] Timed out waiting for current video captions metadata'
      );
    },
    args: [message.videoId, message.type],
  }).then(([result]) => sendResponse(result.result))
    .catch(error => sendResponse({ 'error': error.message }));

  return true;
});

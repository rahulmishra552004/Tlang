console.log('[tlang] service worker started at', new Date().toLocaleTimeString());
browser.runtime.onInstalled.addListener((details) => {
  console.log('[tlang] onInstalled, reason:', details.reason);
});

let count = 0;

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if(!message || message.type !== 'hello') return;

  count++;
  console.log('[tlang] message: ', message, 'from: ', sender);

  sendResponse({ count });
});

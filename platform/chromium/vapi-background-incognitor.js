(function () {
    vAPI.openOptionsPage = function () {
        chrome.windows.getLastFocused(function (win) {
            chrome.tabs.getAllInWindow(win.id, function (tabs) {
                var optionsUrl = chrome.extension.getURL(µBlock.optionsUrl);
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].url == optionsUrl) {
                        chrome.tabs.update(tabs[i].id, {selected: true});
                        return;
                    }
                }

                chrome.tabs.create({windowId: win.id, url: µBlock.optionsUrl, active: true});
            });
        });
    };



    /**
     * Opens help tab or focuses an existing one, within the last focused window.
     */
    vAPI.openHelpPage = function () {
        chrome.windows.getLastFocused(function (win) {
            chrome.tabs.getAllInWindow(win.id, function (tabs) {
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].url == µBlock.helpPageUrl) {
                        chrome.tabs.update(tabs[i].id, {selected: true});
                        return;
                    }
                }

                chrome.tabs.create({windowId: win.id, url: µBlock.helpPageUrl, active: true});
            });
        });
    };
})();
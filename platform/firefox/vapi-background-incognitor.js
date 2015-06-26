(function () {
    vAPI.openOptionsPage = function () {
        vAPI.tabs.open({
            url: vAPI.getURL(µBlock.optionsUrl),
            index: -1,
            select: true
        });
    };

    vAPI.openHelpPage = function () {
        vAPI.tabs.open({
            url: µBlock.helpPageUrl,
            index: -1,
            select: true
        });
    };
})();
/*******************************************************************************

 µBlock - a Chromium browser extension to block requests.
 Copyright (C) 2014 Raymond Hill

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program.  If not, see {http://www.gnu.org/licenses/}.

 Home: https://github.com/gorhill/uBlock
 */

/* global punycode, uDom */

'use strict';

/******************************************************************************/

(function () {

    var popupData;
    var scopeToSrcHostnameMap = {
        '/': '*',
        '.': ''
    };
    var hostnameToSortableTokenMap = {};
    var cachedPopupHash = '';


    var selectors = {
        tabDomain: ".tabDomain",
        pageAdsBlocked: "#stats-page .blocked-quantity",
        totalAdsBlocked: "#stats-total span",
        closeBtn: ".close-button",
        optionsBtn: ".options-button",
        helpBtn: "#help-button",
        reloadPanel: ".reloader",
        reloadBtn: ".reloader .reload-refresh",
        closeReloadPanelBtn: ".reload-close",
        whiteListBlock: "#whitelist_block",
        whiteListBtn: "#whitelist-button",
        whiteListBtnLabel: "#whitelist-button .button-label",
        pauseBtn: "#pause-blocking-button",
        pauseBtnLabel: "#pause-blocking-button .button-label",
        filtersContainer: "#subscription-list-wrapper",
        subscriptionTemplate: "#subscription-template",
        subscrItemBody: ".info-container",
        subscrBlockBtn: ".blocking-control",
        subscrArrowBtn: ".arrow",
        subscrFiltersList: ".filters-list",
        urlBlockBtn: ".filter-blocking-button"
    };

    /***************************************************************************/

    // https://github.com/gorhill/httpswitchboard/issues/345

    var messager = vAPI.messaging;

    /***************************************************************************/
    
    var cachePopupData = function (data) {
        popupData = {};
        scopeToSrcHostnameMap['.'] = '';
        hostnameToSortableTokenMap = {};

        if (typeof data !== 'object') {
            return popupData;
        }
        popupData = data;
        scopeToSrcHostnameMap['.'] = popupData.pageHostname || '';
        var hostnameDict = popupData.hostnameDict;
        if (typeof hostnameDict !== 'object') {
            return popupData;
        }
        var domain, prefix;
        for (var hostname in hostnameDict) {
            if (hostnameDict.hasOwnProperty(hostname) === false) {
                continue;
            }
            domain = hostnameDict[hostname].domain;
            if (domain === popupData.pageDomain) {
                domain = '\u0020';
            }
            prefix = hostname.slice(0, 0 - domain.length);
            hostnameToSortableTokenMap[hostname] = domain + prefix.split('.').reverse().join('.');
        }
        return popupData;
    };

    /***************************************************************************/

    var hashFromPopupData = function (reset) {
        var hasher = [];
        var rules = popupData.dynamicFilterRules;
        var rule;
        for (var key in rules) {
            if (rules.hasOwnProperty(key) === false) {
                continue;
            }
            rule = rules[key];
            if (rule !== '') {
                hasher.push(rule);
            }
        }
        hasher.push(uDom('#switch').hasClass('off'));

        var hash = hasher.sort().join('');
        if (reset) {
            cachedPopupHash = hash;
        }
        uDom('body').toggleClass('dirty', hash !== cachedPopupHash);
    };

    /***************************************************************************/

    var renderTrackedUrls = function () {
        popupData.trackedUrls = {};
        if (!popupData.urls) {
            return;
        }
        var filterPath;
        for (var key in popupData.urls) {
            // if (popupData.urls[key].quantity)
          
            filterPath = popupData.urls[key].filterPath;
            if (!filterPath) continue;
            
            if (!popupData.trackedUrls[filterPath])
                popupData.trackedUrls[filterPath] = [];
            
            popupData.trackedUrls[filterPath].push(key);
        }
    };


    var getTrackedUrlsData = function (path) {
        var urls = popupData.trackedUrls[path] || [];
        var urlsData = [];
        var filter = popupData.usedFilters[path];

        var counter = 1,
            isBlocked = false;

        for (var i = 0; i < urls.length; i++) {
            counter = popupData.urls[urls[i]].quantity;
            isBlocked = isRuleBlocked(filter, urls[i]);

            var url = urls[i].split(" ");
            url.shift();
            url = url.join(" ");
            
            
            var data = {
                // url: getUrlFromStr(urls[i]),
                url: url,
                counter: counter,
                counterVisibility: ((counter > 1) ? "" : "disabled"),
                blockedBtnClass: (isBlocked ? "blocked" : ""),
                blockedBtnTitle: (isBlocked ? "unblock" : "block"),
                blockedBtnText: (isBlocked ? "blocked" : "unblocked")
            };
            urlsData.push(data);
        }

        return urlsData;
    };

    var getBlockedUrlsQty = function (path) {
        var quantity = 0;
        var urls = popupData.trackedUrls[path] || [];
        var filter = popupData.usedFilters[path];

        for (var i = 0; i < urls.length; i++) {
            if (isRuleBlocked(filter, urls[i]))
                quantity += popupData.urls[urls[i]].quantity;
        }

        return quantity;
    };

    var getTrackedUrlsQty = function (path) {
        var quantity = 0;
        var urls = popupData.trackedUrls[path] || [];
        var filter = popupData.usedFilters[path];

        for (var i = 0; i < urls.length; i++) {
            quantity += popupData.urls[urls[i]].quantity;
        }

        return quantity;
    };

    /***************************************************************************/

    var displayUsedFilters = function () {
        var listContainer = uDom(selectors.filtersContainer);
        listContainer.empty();

        if (!popupData.urls || !Object.keys(popupData.urls).length || !popupData.netFilteringSwitch) {
            return;
        }


        var template = uDom(selectors.subscriptionTemplate).text();

        var usedFilters = popupData.usedFilters || {};
        var fragment = document.createDocumentFragment();

        usedFilters = convertUsedFilters(usedFilters);

        usedFilters.forEach(function (filter) {
            var filterEl = createUsedFilterItem(filter, template);
            fragment.appendChild(filterEl);
        });

        listContainer.append(fragment);
    
        if (!isFirefox())
            $(".subscription .filters-list > div").niceScroll({cursorcolor:"#bec0c1", autohidemode: false, cursorwidth: "3px"});
    };

    /**
     * Convert "usedFilters" object to array of needed data.
     * @param {Object} usedFilters
     */
    var convertUsedFilters = function (usedFilters) {
        var response = [];
        for (var path in usedFilters) {
            var filter = usedFilters[path];
            if (filter.off) continue;

            var filterData = {};
            filterData.title = filter.title;
            filterData.group = filter.group;
            filterData.id = path;
            filterData.isEnabled = isFilterEnabled(filter);
            filterData.filterBlockBtnTitle = "Click to " +
            (isFilterEnabled(filter) === "disabled" ? "block" : "unblock") + " filter on current domain";
            filterData.trackedUrls = getTrackedUrlsData(path);
            filterData.trackedUrlsQty = getTrackedUrlsQty(path);
            filterData.blockedUrlsQty = getBlockedUrlsQty(path);

            response.push(filterData);
        }

        response = sortUsedFilters(response);

        return response;
    };

    var sortUsedFilters = function (filters) {
        return filters.sort(function (a, b) {
            if (a.title < b.title) {
                return false;
            }
            else if (a.title > b.title) {
                return true;
            }
            else
                return 0;
        });
    };

    /***************************************************************************/

    var isRuleBlocked = function  (filter, link) {
        var isBlocked = false;
        var urlObj = new URL(getUrlFromStr(link));
        var url = urlObj.href.replace(urlObj.search, "");

        if (filter.exceptions && filter.exceptions.links
                && filter.exceptions.links.hasOwnProperty(url)
                && filter.exceptions.links[url].hasOwnProperty(popupData.pageDomain))
            isBlocked = filter.exceptions.links[url][popupData.pageDomain];
        else if (isFilterEnabled(filter) === "")
            isBlocked = true;

        return isBlocked;
    };


    /**
     * 01.07.2016 Igor
     * uBlock add links with their types, like:
     *    "script http://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
     * We need to receive only url without it type.
     * @param {string} str
     */
    var getUrlFromStr = function (str) {
        if (!str) return str;
        var arr = str.split(" ");
        if (arr.length > 2) {
            return arr[2];
        }
        else if (arr.length > 1) {
            return arr[1];
        }
        else
            return str;
    };

    /***************************************************************************/

    /**
     * Detect is current filter used on current domain.
     * @param {Object} filter
     * {
     *      defaultOff: boolean,
     *      exceptions: {
     *          <domainName>: boolean   // if true - always enabled for this domain
     *      }
     * }
     * @returns {string}
     */
    var isFilterEnabled = function (filter) {
        var isUsed = false;

        if (filter.exceptions && filter.exceptions.domains
                && filter.exceptions.domains.hasOwnProperty(popupData.pageDomain))
            isUsed = filter.exceptions.domains[popupData.pageDomain];
        else
            isUsed = !filter.defaultOff;

        return isUsed ? "" : "disabled";
    };

    /***************************************************************************/

    var createUsedFilterItem = function (data, template) {
        if (!data || !template) return null;
        var filterEl = document.createElement("div");
        try {
            filterEl.className = "subscription";
            filterEl.id = data.id;
            filterEl.setAttribute("data-subscription-title", data.title);
            filterEl.innerHTML = Mustache.render(template, data);
            setSubscrItemHandlers (filterEl, data);
        }
        catch (exception) {
            filterEl = null;
            console.error("Exception in 'createUsedFilter' (popup.js) :\n\t", exception);
        }

        return filterEl;
    };

    /**
     * Set the listeners for click events to the arrow and to the blocking button.
     * Listeners for clicking subscription blocking button or filter blocking button set only if a page not in whitelist
     * and blocking doesn't paused at this moment.
     * @param subscrContainer {HTMLElement}
     * @param subscriptionData {Object}
     */
    var setSubscrItemHandlers = function (subscrContainer, data) {
        var itemBody = subscrContainer.querySelector(selectors.subscrItemBody);
        var blockingControl = subscrContainer.querySelector(selectors.subscrBlockBtn);
        if (!itemBody || !blockingControl) return;

        var arrow = subscrContainer.querySelector(selectors.subscrArrowBtn);
        var filtersList = subscrContainer.querySelector(selectors.subscrFiltersList);

        itemBody.addEventListener ("click", function (ev) {
            try {
                arrow.classList.toggle("down");
                filtersList.classList.toggle("disabled");
            }
            catch (exception) {
                console.error("Exception in '" + selectors.subscrItemBody + "' click event :\n\t", exception);
            }
        }, false);

        blockingControl.addEventListener ("click", function (ev) {
            switchDomainBlocking(blockingControl, data);
        }, false);

        filtersList.addEventListener("click", function (ev) {
            if (ev.target.getAttribute("data-clickable") && ev.target.getAttribute("data-url"))
                switchUrlBlocking(ev.target, data);
        }, false);
    };

    /***************************************************************************/

    var switchDomainBlocking = function (blockingControl, data) {
        var updates = {
            filterPath: data.id,
            domains: {
                domain: popupData.pageDomain,
                state: (data.isEnabled === "disabled" ? true : false)
            }
        };
        data.isEnabled = (data.isEnabled === "disabled" ? "" : "disabled");
        function response (result) {
            blockingControl.classList.toggle("disabled");
            showReloadNotification();
        }
        messager.send('popupPanel', {
            what:  'updateFilter',
            updates: updates
        }, response);
    };

    /***************************************************************************/

    var switchUrlBlocking = function (blockBtn, data) {
        var url = blockBtn.getAttribute("data-url");
        var isBlocked = false;
        var blockedBtnText = "";

        for (var i = 0; i < data.trackedUrls.length; i++) {
            if (data.trackedUrls[i].url === url) {
                isBlocked = (data.trackedUrls[i].blockedBtnClass === "blocked");
                data.trackedUrls[i].blockedBtnClass = isBlocked ? "" : "blocked";
                data.trackedUrls[i].blockedBtnText = (isBlocked ? "unblocked" : "blocked");
                blockedBtnText = data.trackedUrls[i].blockedBtnText;
            }
        }

        var updates = {
            filterPath: data.id,
            links: {
                url: getUrlFromStr(url),
                //url: url,
                domain: popupData.pageDomain,
                state: !isBlocked
            }
        };

        function response (result) {
            blockBtn.classList.toggle("blocked");
            blockBtn.innerHTML = blockedBtnText;
            showReloadNotification();
        }

        messager.send('popupPanel', {
            what:  'updateFilter',
            updates: updates
        }, response);
    };

    /***************************************************************************/

    // Assume everything has to be done incrementally.

    var renderPopup = function () {
        uDom(selectors.tabDomain).text(popupData.pageHostname);

        if (uDom(selectors.whiteListBtn).toggleClass('pressed', popupData.pageURL === '' || !popupData.netFilteringSwitch).hasClass("pressed")) {
            uDom(selectors.whiteListBlock).removeClass('hidden');
            uDom(selectors.whiteListBtnLabel).text('Un-Whitelist');
        }
        else {
            uDom(selectors.whiteListBlock).addClass('hidden');
            uDom(selectors.whiteListBtnLabel).text('Whitelist Site');
        }

        if (uDom(selectors.pauseBtn).toggleClass('pressed', popupData.pauseFiltering).hasClass("pressed")) {
            uDom(selectors.pauseBtnLabel).text('Start blocking');
        }
        else {
            uDom(selectors.pauseBtnLabel).text('Pause blocking');
        }

        uDom(selectors.pageAdsBlocked).text(popupData.pageBlockedRequestCount);
        if (!popupData.pageBlockedRequestCount) {
            uDom(selectors.pageAdsBlocked).addClass("empty");
        }

        uDom(selectors.totalAdsBlocked).text(popupData.globalBlockedRequestCount);
        if (!popupData.globalBlockedRequestCount) {
            uDom(selectors.totalAdsBlocked).addClass("empty");
        }

        renderTrackedUrls();
        displayUsedFilters();
    };

    /**************************************************************/

    var togglePauseFiltering = function (ev) {
        if (!popupData || !popupData.pageURL) {
            return;
        }

        var state = uDom(this).toggleClass('pressed').hasClass('pressed');
        if (state) {
            uDom(selectors.pauseBtnLabel).text('Start blocking');
        }
        else {
            uDom(selectors.pauseBtnLabel).text('Pause blocking');
        }

        messager.send('popupPanel', {
            what:  'togglePauseFiltering',
            state: state,
            tabId: popupData.tabId
        });

        hashFromPopupData();
        showReloadNotification();
    };

    /**************************************************************/
    var toggleNetFilteringSwitch = function (ev) {
        if (!popupData || !popupData.pageURL) {
            return;
        }

        var state = uDom(this).toggleClass('pressed').hasClass('pressed');
        if (state) {
            uDom(selectors.whiteListBtnLabel).text('Un-Whitelist');
        }
        else {
            uDom(selectors.whiteListBtnLabel).text('Whitelist Site');
        }

        messager.send('popupPanel', {
            what:  'toggleNetFiltering',
            url:   popupData.pageURL,
            scope: ev.ctrlKey || ev.metaKey ? 'page' : '',
            state: !state,
            tabId: popupData.tabId
        });

        hashFromPopupData();
        showReloadNotification();
    };


    /***************************************************************************/

    var reloadTab = function () {
        messager.send('popupPanel', {what: 'reloadTab', tabId: popupData.tabId});
        hideReloadNotification();
        // Polling will take care of refreshing the popup content
    };

    /***************************************************************************/

    var openOptionsPage = function () {
        messager.send('popupPanel', {what: 'openOptionsPage'});
        vAPI.closePopup();
    };

    var openHelpPage = function () {
        messager.send('popupPanel', {what: 'openHelpPage'});
        vAPI.closePopup();
    };


    /**
     * Show the notification in the footer of popup with ability to reload a current page.
     */
    function showReloadNotification () {
        var reloader = document.querySelector(selectors.reloadPanel);
        if (reloader && reloader.classList.contains ("disabled")){
            reloader.classList.toggle ("disabled");
        }
    }
    function hideReloadNotification () {
        var reloader = document.querySelector(selectors.reloadPanel);
        if (reloader && !reloader.classList.contains ("disabled")){
            reloader.classList.add("disabled");
        }
    }

    /***************************************************************************/

    // Poll for changes.
    //
    // I couldn't find a better way to be notified of changes which can affect
    // popup content, as the messaging API doesn't support firing events accurately
    // from the main extension process to a specific auxiliary extension process:
    //
    // - broadcasting() is not an option given there could be a lot of tabs opened,
    //   and maybe even many frames within these tabs, i.e. unacceptable overhead
    //   regardless of whether the popup is opened or not.
    //
    // - Modifying the messaging API is not an option, as this would require
    //   revisiting all platform-specific code to support targeted broadcasting,
    //   which who knows could be not so trivial for some platforms.
    //
    // A well done polling is a better anyways IMO, I prefer that data is pulled
    // on demand rather than forcing the main process to assume a client may need
    // it and thus having to push it all the time unconditionally.

    var pollForContentChange = (function () {
        var pollTimer = null;

        var pollCallback = function () {
            pollTimer = null;
            messager.send('popupPanel',
                {
                    what:                'hasPopupContentChanged',
                    tabId:               popupData.tabId,
                    contentLastModified: popupData.contentLastModified
                },
                queryCallback
            );
        };

        var queryCallback = function (response) {
            if (response) {
                getPopupData();
                return;
            }
            poll();
        };

        var poll = function () {
            if (pollTimer !== null) {
                return;
            }
            pollTimer = setTimeout(pollCallback, 1500);
        };

        return poll;
    })();

    /***************************************************************************/

    var getPopupData = function (tabId) {
        var onDataReceived = function (response) {
            console.log(response);
            cachePopupData(response);
            renderPopup();
            hashFromPopupData(true);
            pollForContentChange();

            ffPopupHeightFixes();
        };
        messager.send('popupPanel',
            { what: 'getPopupData', tabId: tabId },
            onDataReceived
        );
    };

    /***************************************************************************/

    /**
     * In FF popup window sometimes has incorrect height and footer buttons disappears.
     * https://github.com/privacore/privacontrol/issues/4
     * When add some attribute to the "body" element - popup height recalculates.
     */
    var ffPopupHeightFixes = function () {
        uDom("body").attr("loaded", true);
    };


    /***************************************************************************/
    
    var isFirefox = function () {
        return navigator.userAgent.match(/Firefox/);
    };
    
    /***************************************************************************/

    // Make menu only when popup html is fully loaded
    uDom.onLoad(function () {
        // If there's no tab id specified in the query string,
        // it will default to current tab.
        var tabId = null;

        // Extract the tab id of the page this popup is for
        var matches = window.location.search.match(/[\?&]tabId=([^&]+)/);
        if ( matches && matches.length === 2 ) {
            tabId = matches[1];
        }
        getPopupData(tabId);

        uDom(selectors.closeBtn).on('click', vAPI.closePopup);
        uDom(selectors.optionsBtn).on('click', openOptionsPage);
        uDom(selectors.helpBtn).on('click', openHelpPage);
        uDom(selectors.reloadBtn).on('click', reloadTab);
        uDom(selectors.closeReloadPanelBtn).on('click', hideReloadNotification);
        uDom(selectors.whiteListBtn).on('click', toggleNetFilteringSwitch);
        uDom(selectors.pauseBtn).on('click', togglePauseFiltering);
    

        if (!isFirefox())
            $("#subscription-list-wrapper").niceScroll({cursorcolor:"#bec0c1", autohidemode: false, cursorwidth: "3px"});
    });

    /***************************************************************************/

})();

/**
 * @file

 * @author Igor Petrenko
 * @date  2/23/2018
 */

"use strict";

(function () {

    var sideNav = null;
    var messager = vAPI.messaging;
    var popupData;
    var scopeToSrcHostnameMap = {
        '/': '*',
        '.': ''
    };
    var hostnameToSortableTokenMap = {};

    var searchQuery = "";

    var isFilterChanged = false;

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

    var isFirefox = function () {
        return navigator.userAgent.match(/Firefox/);
    };

    /***************************************************************************/

    var initializeMaterialControls = function () {
        let elSideNav = document.querySelector('.sidenav');
        sideNav = M.Sidenav.init(elSideNav, {
            draggable: false
        });

        var protectionList = document.querySelector('.collapsible.protection-lists');
        M.Collapsible.init(protectionList, {"accordion": false});

        var domainCookiesList = document.querySelector('.collapsible.domain-cookies-list');
        M.Collapsible.init(domainCookiesList, {"accordion": false});

        initializeTooltips();
    };

    var initializeTooltips = function () {
        // Whitelist buttons (shield icon and floating button in Protection tab)
        M.Tooltip.init($("#protection_status_btn")[0], {enterDelay: 300});
        M.Tooltip.init($("#pause_site_btn")[0], {enterDelay: 300});
        M.Tooltip.init($(".element-picker-btn")[0], {enterDelay: 300});
        M.Tooltip.init($(".open-protection-lists-btn")[0], {enterDelay: 300});

        M.Tooltip.init($(".domain-cookies-reset-btn")[0], {enterDelay: 300});

        var footerLogo = document.querySelector('.footer-btn.logo');
        M.Tooltip.init(footerLogo, {enterDelay: 500});

        var footerFavBtn = document.querySelector('.footer-btn.fav-btn');
        if (isFirefox())
            $(footerFavBtn).attr('data-tooltip', vAPI.i18n('popupTipFooterRateAddon'));
        else
            $(footerFavBtn).attr('data-tooltip', vAPI.i18n('popupTipFooterRateExtension'));

        M.Tooltip.init(footerFavBtn, {enterDelay: 500});
    };

    var updateFiltersTitleTooltips = function () {
        var elFiltersTitle = $('.protection-lists .protection-filter .filter-title');
        elFiltersTitle.each(function (index, filter) {
            M.Tooltip.init(filter, {enterDelay: 500});
        });
    };


    /**
     * "Remove all" cookies floating button can be disabled if domain has no cookies
     *      in this case we must disable button tooltip.
     * @type {null} - instance of Material tooltip object
     * @private
     */
    var _removeCookiesBtnTip = null;
    var addRemoveCookiesBtnTip = function () {
        if (_removeCookiesBtnTip)
            rmRemoveCookiesBtnTip();

        _removeCookiesBtnTip = M.Tooltip.init($("#domain_cookies_remove_btn")[0], {enterDelay: 300});
    };
    var rmRemoveCookiesBtnTip = function () {
        if (_removeCookiesBtnTip)
            _removeCookiesBtnTip.destroy();
    };

    /***************************************************************************/

    var handleControls = function () {
        handleMainPageTabs();
        handleSidebarControls();
        handleFooterControls();
        handleOptionsButtons();

        handleSearchBar();
        handleSearchTabPlates();

        handleWhitelistBtn();
        handleProtectionListsBtn();
        handleElementPickerBtn();

        handleStartProtectionBtn();

        handleCookiesTab();

        handleSocialBlocking();

        handleCloseProtectionListsBtn();
        handleOpenSearchTabBtn();

        handleFloatingActionBtn();

        handleShareDialog();
    };

    var handleMainPageTabs = function () {
        let elMainPageTabs = $('.main-content .tabs .tab a');
        // let elTabFrames = $('.tab-frame');
        elMainPageTabs.on("click", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();

            switchToMainPageTab($(ev.currentTarget).attr('data-id'));
        })
    };

    var switchToMainPageTab = function (tabId) {
        let elMainPageTabs = $('.main-content .tabs .tab a');
        let elTabFrames = $('.tab-frame');
        let tabHeaderBtn = $('.main-content .tabs .tab a[data-id="' + tabId + '"]');
        elTabFrames.removeClass('active');
        $("#" + tabId).addClass('active');
        elMainPageTabs.removeClass('active');
        $(tabHeaderBtn).addClass('active');
        saveActiveTabState(tabId);


        $('.main-tabs-slider').attr('data-active-tab', tabId);
    };

    var saveActiveTabState = function (tabId) {
        messager.send('popupPanel', {what: 'saveActiveTabState', tabId: tabId});
    };

    var handleProtectionListsBtn = function () {
        $('.open-protection-lists-btn').off('click');
        $('.open-protection-lists-btn').on('click', openProtectionListsPage);
    };

    var handleCloseProtectionListsBtn = function () {
        $('#close_protection_lists').off('click');
        $('#close_protection_lists').on('click', closeProtectionListsPage);
    };

    /**
     * Handle search button located in a hedaer of "Protection lists" page
     */
    var handleOpenSearchTabBtn = function () {
        $('#open_search_tab_btn').off('click');
        $('#open_search_tab_btn').on('click', function (ev) {
            switchToMainPageTab('search_tab');
            closeProtectionListsPage();
            $("#search_input").focus();
        });
    };

    /***************************************************************************/

    var handleSidebarControls = function () {
        var closeSidebarBtn = $('#slide-out .close-sidenav-btn');
        closeSidebarBtn.off("click");
        closeSidebarBtn.on("click", function (ev) {
            closeSidebar();
        });

        var sidebarLinks = $('#slide-out li a');
        sidebarLinks.off("click");
        sidebarLinks.on("click", ev => onSidebarLinkClick($(ev.currentTarget).attr("data-action")));
    };

    var closeSidebar = function () {
        if (sideNav)
            sideNav.close();
    };

    var onSidebarLinkClick = function (action) {
        switch (action) {
            case "protection_lists":
                openProtectionListsPage();
                break;
            case "tracking_monitor":
                openTrackingMonitor();
                break;
            case "stop_protection":
                stopProtection();
                break;
            case "settings":
                openOptionsPage();
                break;
            case "feedback":
                openFeedback();
                break;
            case "share":
                openShareDialog();
                break;
            case "findx_mobile":
                openFindxMobile();
                break;
        }

        closeSidebar();
    };

    var openFindxMobile = function () {
        messager.send('popupPanel', {what: 'openFindxMobile'});
        vAPI.closePopup();
    };

    var openFeedback = function () {
        messager.send('popupPanel', {what: 'openFeedback'});
        vAPI.closePopup();
    };

    var openTrackingMonitor = function () {
        messager.send('popupPanel', {what: 'openTrackingMonitor', tabId: popupData.tabId});
        vAPI.closePopup();
    };

    /***************************************************************************/

    var handleFooterControls = function () {
        $('.footer-btn').off("click");
        $('.footer-btn').on("click", ev => {
            ev.stopPropagation();
            ev.preventDefault();

            let action = $(ev.currentTarget).data("action");
            switch (action) {
                case 'share':
                    openShareDialog();
                    break;
                case 'logo':
                    openHelpPage();
                    break;
                case 'favorites':
                    openRatePage();
                    break;
            }
        });
    };

    var openHelpPage = function () {
        messager.send('popupPanel', {what: 'openHelpPage'});
        vAPI.closePopup();
    };

    var openRatePage = function () {
        messager.send('popupPanel', {what: 'openRatePage'});
        vAPI.closePopup();
    };

    /***************************************************************************/

    var handleShareDialog = function () {
        $('.share-dialog .share-dialog-header .share-dialog-close-btn').off("click");
        $('.share-dialog .share-dialog-header .share-dialog-close-btn').on("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();

            closeShareDialog();
        });

        $('.share-dialog .share-dialog-controls .share-btn').off("click");
        $('.share-dialog .share-dialog-controls .share-btn').on("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();

            onShareBtnClick($(ev.currentTarget).data("social"));
            closeShareDialog();
        });
    };

    var openShareDialog = function () {
        $('body').addClass('share-active');
        switchToMainPageTab('protection_tab');
        closeProtectionListsPage();
    };
    var closeShareDialog = function () {
        $('body').removeClass('share-active');
    };

    var onShareBtnClick = function (social) {
        messager.send('popupPanel', {what: 'shareTo', social: social});
        vAPI.closePopup();
    };

    /***************************************************************************/

    var handleOptionsButtons = function () {
        $('.settings-btn').off("click");
        $('.settings-btn').on("click", openOptionsPage);
    };

    var openOptionsPage = function () {
        messager.send('popupPanel', {what: 'openOptionsPage'});
        vAPI.closePopup();
    };

    /***************************************************************************/

    var handleSearchBar = function () {
        $('#search_input').off('keyup');
        $('#search_input').on('keyup', function (ev) {
            if (ev.keyCode === 13) {
                openSearch("text");
            }
            else {
                searchQuery = $(this).val();
            }
        });

        $('#search_bar_btn').off('click');
        $('#search_bar_btn').on('click', function () {
            openSearch("text");
        });
    };

    var handleSearchTabPlates = function () {
        $('#search_tab .plate:not(.invisible-plate)').off('click');
        $('#search_tab .plate:not(.invisible-plate)').on('click', function (ev) {
            var type = $(ev.currentTarget).data('type');
            openSearch(type);
        });
    };

    var openSearch = function (searchType) {
        messager.send('popupPanel', {what: 'openSearch', query: searchQuery, searchType: searchType});
        vAPI.closePopup();
    };

    /***************************************************************************/

    var showTodayBlockedCount = function () {
        $(".blocked-today-plate .plate-content-text span, #statusbar #today_blocked_count")
            .text(popupData.blockedTodayCount || 0);
    };

    /***************************************************************************/

    var openProtectionListsPage = function () {
        $("#main_page").removeClass('active');
        $("#protection_lists_page").addClass('active');
    };

    var closeProtectionListsPage = function () {
        $("#protection_lists_page").removeClass('active');
        $("#main_page").addClass('active');
    };

    /***************************************************************************/

    var handleElementPickerBtn = function () {
        $(".element-picker-btn").off("click");
        $(".element-picker-btn").on("click", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();

            if (popupData.canElementPicker === true)
                gotoPick();
        });
    };

    var gotoPick = function() {
        messager.send(
            'popupPanel',
            {
                what: 'launchElementPicker',
                tabId: popupData.tabId
            }
        );

        vAPI.closePopup();
    };

    /***************************************************************************/

    var showWhitelistStatus = function () {
        let status = (popupData.pageURL === '' || !popupData.netFilteringSwitch);
        $('body').toggleClass('protection-off', status);

        $("#protection_status_btn, #pause_site_btn").attr('data-tooltip', status ?
            vAPI.i18n('popupTipStartOnSite') : vAPI.i18n('popupTipPauseOnSite'));
        M.Tooltip.init($("#protection_status_btn")[0], {enterDelay: 300});
        M.Tooltip.init($("#pause_site_btn")[0], {enterDelay: 300});
    };

    var handleWhitelistBtn = function () {
        $("#protection_status_btn, #pause_site_btn").off("click");
        $("#protection_status_btn, #pause_site_btn").on("click", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();

            changeWhitelistStatus(ev);
        });
    };

    var changeWhitelistStatus = function (ev) {
        if (!popupData || !popupData.pageURL) {
            return;
        }

        popupData.netFilteringSwitch = !popupData.netFilteringSwitch;

        messager.send('popupPanel', {
            what:  'toggleNetFiltering',
            url:   popupData.pageURL,
            scope: ev.ctrlKey || ev.metaKey ? 'page' : '',
            state: popupData.netFilteringSwitch,
            tabId: popupData.tabId
        });

        showWhitelistStatus();

        reloadTab();
        vAPI.closePopup();
    };

    /***************************************************************************/

    /**
     * Protection stopped - means filtering is paused for all sites.
     */
    var showProtectionStoppedStatus = function () {
        $('body')
            .toggleClass('protection-stopped', popupData.pauseFiltering)
            .toggleClass('protection-off', popupData.pauseFiltering);

        let whitelistStatus = (popupData.pageURL === '' || !popupData.netFilteringSwitch);
        if (whitelistStatus)
        {
            $('body').toggleClass('protection-off', whitelistStatus);
        }
    };

    var stopProtection = function () {
        togglePauseFiltering();
        switchToMainPageTab('protection_tab');
    };

    var handleStartProtectionBtn = function () {
        $("#protection_stopped_btn").off("click");
        $("#protection_stopped_btn").on("click", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();

            togglePauseFiltering();
        });
    };

    var togglePauseFiltering = function () {
        if (!popupData || !popupData.pageURL) {
            return;
        }

        popupData.pauseFiltering = !popupData.pauseFiltering;

        messager.send('popupPanel', {
            what:  'togglePauseFiltering',
            state: popupData.pauseFiltering,
            tabId: popupData.tabId
        });

        showProtectionStoppedStatus();
        reloadTab();
        vAPI.closePopup();
    };


    /***************************************************************************/

    var socialBlockingGroups = ['facebook', 'google'];

    var showSocialBlockingStatus = function () {
        var whitelistStatus = (popupData.pageURL === '' || !popupData.netFilteringSwitch);

        if (whitelistStatus || popupData.pauseFiltering) {
            $('.social-blocking-plate .switch input[type="checkbox"]').attr('disabled', true);
            $('.social-blocking-plate .switch input[type="checkbox"]').attr('checked', false);
        }
        else {
            $('.social-blocking-plate .switch input[type="checkbox"]').removeAttr('disabled');

            socialBlockingGroups.forEach(function (groupName) {
                let groupStatus = false;
                if (popupData.filtersGroupsExceptions && popupData.filtersGroupsExceptions.hasOwnProperty(groupName)
                        && popupData.filtersGroupsExceptions[groupName].hasOwnProperty(popupData.pageDomain))
                {
                    groupStatus =  popupData.filtersGroupsExceptions[groupName][popupData.pageDomain];
                }
                else if (isSomeFilterInGroupDefaultOn(groupName)) {
                    // If just one filterlist in a group is default turned on,  the switch for group must be default on.
                    groupStatus = true;
                }

                $('.social-blocking-plate .switch input[data-action="' + groupName + '"]').attr('checked', groupStatus);
            });
        }
    };

    var handleSocialBlocking = function () {
        $('.social-blocking-plate .switch input[type="checkbox"]').off('change');
        $('.social-blocking-plate .switch input[type="checkbox"]').on('change', function (ev) {
            var action = $(ev.currentTarget).data('action');
            switchSocialBlocking(action);
        });
    };

    var switchSocialBlocking = function (groupName) {
        let filterState = false;

        if (popupData.filtersGroupsExceptions
            && popupData.filtersGroupsExceptions.hasOwnProperty(groupName)
            && popupData.filtersGroupsExceptions[groupName].hasOwnProperty(popupData.pageDomain))
        {
            filterState = popupData.filtersGroupsExceptions[groupName][popupData.pageDomain];
        }
        else if (isSomeFilterInGroupDefaultOn(groupName)) {
            // If just one filterlist in a group is default turned on,  the switch for group must be default on.
            filterState = true;
        }

        messager.send('popupPanel', {
            what:  'setFiltersGroupException',
            data: {
                group: groupName,
                pageDomain: popupData.pageDomain,
                state: !filterState
            }
        });

        reloadTab();
        vAPI.closePopup();
    };

    var isSomeFilterInGroupDefaultOn = function (groupName) {
        let groupFilters = getFiltersFromGroup(groupName);
        for (let i = 0; i < Object.keys(groupFilters).length; i++) {
            let filter = groupFilters[Object.keys(groupFilters)[i]];
            if (!filter.defaultOff) {
                return true;
            }
        }

        return false;
    };

    var getFiltersFromGroup = function (groupName) {
        let filters = {};

        Object.keys(popupData.usedFilters).forEach(function (filterName) {
            if (popupData.usedFilters.hasOwnProperty(filterName)
                &&  popupData.usedFilters[filterName].group === groupName)
            {
                filters[filterName] = popupData.usedFilters[filterName];
            }
        });

        return filters;
    };

    /***************************************************************************/

    var renderTrackedUrls = function () {
        popupData.trackedUrls = {};
        if (!popupData.urls) {
            return;
        }
        var filterPath;
        for (var key in popupData.urls) {
            filterPath = popupData.urls[key].filterPath;
            if (!filterPath) continue;

            // If multiple filters has equal rule - filterPath will be an array of names
            if (typeof filterPath === 'object') {
                filterPath.forEach(function (path) {
                    if (!popupData.trackedUrls[path])
                        popupData.trackedUrls[path] = [];

                    popupData.trackedUrls[path].push(key);
                })
            }
            else { // If current url has a rule which exists in only one filter
                if (!popupData.trackedUrls[filterPath])
                    popupData.trackedUrls[filterPath] = [];

                popupData.trackedUrls[filterPath].push(key);
            }
        }
    };

    var displayUsedFilters = function (isInitial) {
        var listContainer = $(".protection-lists");

        // if (isInitial) {
            rmFilters();
            listContainer.empty();

            if (!popupData.urls || !Object.keys(popupData.urls).length || !popupData.netFilteringSwitch) {
                return;
            }

            var usedFilters = popupData.usedFilters || {};

            usedFilters = convertUsedFilters(usedFilters);

            usedFilters.forEach(function (filter) {
                createUsedFilterItem(filter, listContainer);
            });
        // }
        // else { // Update existed filters
        //     if (!popupData.urls || !Object.keys(popupData.urls).length || !popupData.netFilteringSwitch) {
        //         listContainer.empty();
        //         return;
        //     }
        //
        //     var usedFilters = popupData.usedFilters || {};
        //     usedFilters = convertUsedFilters(usedFilters);
        //
        //     usedFilters.forEach(function (filterData) {
        //         var filterObj = findFilterById(filterData.id);
        //         if (!filterObj) {
        //             createUsedFilterItem(filterData, listContainer);
        //         }
        //         else {
        //             filterObj.update(filterData);
        //         }
        //     });
        // }

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

        return isUsed;
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
        else if (isFilterEnabled(filter))
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
                isBlocked: isBlocked
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

    var createUsedFilterItem = function (data, listContainer) {
        if (!data) return null;

        var filter = new FilterItem(data);
        filter.addTo(listContainer);
        filters.push(filter);
    };

    var findFilterById = function (filterId) {
        var filter = null;

        filter = filters.find(filterObj => filterObj.id === filterId);

        return filter;
    };

    var rmFilters = function () {
        filters.forEach(function (filter) {
            filter.remove();
        });
        filters = [];
    };

    var filters = [];
    var filterItemTmplt = "";

    var FilterItem = function (initData) {

        var filterData = initData;
        var elFilter = null;


        var init = function () {
            if (!filterData)
                return;

            createFilterTemplate();
        };

        var createFilterTemplate = function () {
            if (!filterItemTmplt)
                return;

            elFilter = $(Mustache.render(filterItemTmplt, filterData));
            handleFilterElement();
        };

        var handleFilterElement = function () {
            elFilter.find(".collapsible-header").on('click', function (ev) {
                setTimeout(function () {
                    if ($(elFilter).find(".collapsible-body").is(":visible") && filterData.trackedUrls && filterData.trackedUrls.length > 5) {
                        $(elFilter).find(".collapsible-body").mCustomScrollbar({
                            scrollInertia: 0,
                            autoHideScrollbar: false,
                            scrollButtons:{ enable: false },
                            advanced:{ updateOnContentResize: true },
                            mouseWheel:{
                                scrollAmount: 50
                            }
                        });
                    }
                    else {
                        $(elFilter).find(".collapsible-body").mCustomScrollbar("destroy");
                    }
                }, 400);
            });
            elFilter.find(".collapsible-header .switch").on('click', function (ev) {
                ev.stopPropagation();
            });
            elFilter.find(".collapsible-header .switch input").on('change', onFilterStateChange);

            elFilter.find(".collapsible-body .filter-rule .rule-radio").on('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();

                var isChecked = $(ev.currentTarget).find('input.with-gap').attr('checked');
                $(ev.currentTarget).find('input.with-gap').attr('checked', !isChecked);

                var url = $(ev.currentTarget).attr("data-url");
                switchUrlBlocking(url, !isChecked);

                onFilterUpdated();
            });
        };

        var onFilterStateChange = function (ev) {
            ev.stopPropagation();

            switchDomainBlocking();
            onFilterUpdated();
        };

        var switchDomainBlocking = function () {
            var updates = {
                filterPath: filterData.id,
                domains: {
                    domain: popupData.pageDomain,
                    state: !filterData.isEnabled
                }
            };
            filterData.isEnabled = !filterData.isEnabled;
            function response (result) {
                // setSwitchState(filterData.isEnabled);
            }
            messager.send('popupPanel', {
                what:  'updateFilter',
                updates: updates
            }, response);
        };

        var setSwitchState = function (state) {
            elFilter.find('.collapsible-header .switch input').prop( "checked", state );
        };



        var switchUrlBlocking = function (url, newState) {
            var updates = {
                filterPath: filterData.id,
                links: {
                    url: getUrlFromStr(url),
                    domain: popupData.pageDomain,
                    state: newState
                }
            };

            function response (result) {

            }

            messager.send('popupPanel', {
                what:  'updateFilter',
                updates: updates
            }, response);
        };




        var updateFilterData = function (data) {

        };


        var addFilterToList = function (divList) {
            if (!divList)
                return;

            $(divList).append(elFilter);
        };

        var removeFilter = function () {
            elFilter.find(".collapsible-header .switch").off('click')
            elFilter.find(".collapsible-header .switch input").off('change', onFilterStateChange);
            elFilter.find(".collapsible-body .filter-rule .rule-radio").off('click');
        };


        init();

        return {
            get id () {
                return filterData ? filterData.id : null;
            },
            addTo: addFilterToList,
            update: updateFilterData,
            remove: removeFilter
        };
    };

    var onFilterUpdated = function () {
        isFilterChanged = true;
        $('#protection_lists_page').toggleClass('content-changed', isFilterChanged);

        var floatingBtn = $('#protection_lists_page .fixed-action-btn .btn-floating');
        if (!floatingBtn[0].hasAttribute('data-tooltip')) {
            $(floatingBtn).attr('data-tooltip', vAPI.i18n('popupTipRefreshBtn'));
            M.Tooltip.init(floatingBtn, {enterDelay: 500});
        }
    };

    /***************************************************************************/

    var handleFloatingActionBtn = function () {
        $('#protection_lists_page .fixed-action-btn .btn-floating').off('click');
        $('#protection_lists_page .fixed-action-btn .btn-floating').on('click', function (ev) {
            ev.stopPropagation();
            ev.preventDefault();

            if (popupData.pauseFiltering) {
                togglePauseFiltering();
                reloadTab();
            }
            else if (!popupData.canElementPicker) {
                openOptionsPage();
            }
            else if (!popupData.netFilteringSwitch) {
                changeWhitelistStatus(ev);
                reloadTab();
            }
            else if (isFilterChanged) {
                reloadTab();
            }
            else {
                openOptionsPage();
            }

            vAPI.closePopup();
        });
    };

    var reloadTab = function () {
        messager.send('popupPanel', {what: 'reloadTab', tabId: popupData.tabId});
    };

    /***************************************************************************/

    /**
     * Handle controls in cookies tab.
     */
    var handleCookiesTab = function () {
        handleRemoveAllCookiesBtn();
        handleWhitelistCookiesDomainBtn();
        handleBlacklistCookiesDomainBtn();
        handleResetCookiesDomainBtn();

        handleNoCookiesListOpening();

        handleAdvancedSettingsBtn();
        handleCookiesSettings();
    };

    var handleRemoveAllCookiesBtn = function () {
        $("#domain_cookies_remove_btn").off('click');
        $("#domain_cookies_remove_btn").on('click', function (ev) {
            messager.send('popupPanel', {
                what:  'removeDomainCookies',
                domain:   popupData.pageDomain
            });

            reloadTab();
            vAPI.closePopup();
        });
    };

    var handleWhitelistCookiesDomainBtn = function () {
        $('#cookies_tab .domain-cookies-whitelist-btn').off('click');
        $('#cookies_tab .domain-cookies-whitelist-btn').on('click', onDomainWhitelistClick);
    };

    var handleBlacklistCookiesDomainBtn = function () {
        $('#cookies_tab .domain-cookies-blacklist-btn').off('click');
        $('#cookies_tab .domain-cookies-blacklist-btn').on('click', onDomainBlacklistClick);
    };

    var handleResetCookiesDomainBtn = function () {
        $('#cookies_tab .domain-cookies-reset-btn').off('click');
        $('#cookies_tab .domain-cookies-reset-btn').on('click', resetCookiesDomainState);
    };

    /**
     * If domain has no cookies - we'll prevent cookies list expanding.
     */
    var handleNoCookiesListOpening = function () {
        var divCookiesContainer = $('.domain-cookies-list');
        divCookiesContainer.find(".collapsible-header").off('click');
        divCookiesContainer.find(".collapsible-header").on('click', function (ev) {
            if (isNoDomainCookies()) {
                ev.stopPropagation();
                ev.preventDefault();
            }
        });
    };


    /***************************************************************************/

    var renderCookiesTab = function () {
        console.log ("renderCookiesTab ()            popup-privacycontrol.js" +
                        "\n\t popupData: ", popupData);

        showCookiesDomain();
        showDomainWhitelistState();
        showDomainBlacklistState();
        showCookiesQuantity();
        updateNoCookies();
        renderCookiesSettings();
        renderCookiesList();
    };

    /***************************************************************************/

    var showCookiesDomain = function () {
        let pageDomain = popupData.pageHostname;
        if (!pageDomain.match(/^\./)) {
            pageDomain = "." + pageDomain;
        }
        pageDomain = "*" + pageDomain;
        $(".cookies-domain").text(pageDomain);
    };

    /***************************************************************************/

    /**
     * If opened domain has no cookies - we must disable "Remove all" floating button
     *      and make cookies list not expandable.
     */
    var updateNoCookies = function () {
        if (isNoDomainCookies()) {
            $('body').toggleClass('no-cookies', true);
            rmRemoveCookiesBtnTip(); // disable button tooltip.
        }
        else {
            $('body').toggleClass('no-cookies', false);
            if (!_removeCookiesBtnTip) // enable button tooltip if it is not enabled yet
                addRemoveCookiesBtnTip();
        }
    };

    /***************************************************************************/

    var showCookiesQuantity = function () {
        $("#cookies_tab .domain-cookies-count").text(getAllowedCookiesQty());
        $("#cookies_tab .domain-cookies-count-total")
            .text(popupData.cookies ? popupData.cookies.length || 0 : 0);
    };

    /**
     * Returns quantity of cookies which were not blocked.
     * Current number is displays in a plate (large font number)
     * @returns {number}
     */
    var getAllowedCookiesQty = function () {
        let qty = 0;

        if (popupData && popupData.cookies) {
            popupData.cookies.forEach(function (cookie) {
                if (!cookie.removed)
                    qty++;
            });
        }

        return qty;
    };

    /***************************************************************************/

    var isNoDomainCookies = function () {
        return !popupData.cookies || !popupData.cookies.length;
    };

    /***************************************************************************/

    var onDomainWhitelistClick = function () {
        var state = isCookieDomainWhitelisted(popupData.pageDomain);
        if (state)
            return;

        setDomainWhitelistState(!state);
        reloadTab();
        vAPI.closePopup();

        // var blacklisted = isCookieDomainBlacklisted(popupData.pageDomain);
        // if (blacklisted) {
        //     setDomainBlacklistState(!blacklisted);
        // }
    };

    var setDomainWhitelistState = function (state) {
        // Add domain to whitelist locally.
        // TODO: if we'll reload a tab after button clicked - remove this line
        if (state)
            popupData.cookiesSettings.whitelist.domains.push(popupData.pageDomain);
        else
            rmDomainFromWhitelist();

        showDomainWhitelistState();

        messager.send('popupPanel', {
            what:  'toggleCookiesDomainWhitelist',
            domain:   popupData.pageDomain,
            state: state
        });
    };

    var showDomainWhitelistState = function () {
        $('#cookies_tab .domain-cookies-plate')
            .toggleClass('whitelisted-domain', isCookieDomainWhitelisted(popupData.pageDomain));
    };

    var isCookieDomainWhitelisted = function (domain) {
        if (!popupData || !popupData.cookiesSettings || !popupData.cookiesSettings.whitelist)
            return false;

        return popupData.cookiesSettings.whitelist.domains.indexOf(domain) !== -1;
    };

    /**
     * Current method used only for removing from local variable "popupData.cookiesSettings.blacklist.whitelist"
     */
    var rmDomainFromWhitelist = function () {
        let domainIndex = popupData.cookiesSettings.whitelist.domains.indexOf(popupData.pageDomain);
        if (domainIndex !== -1)
            popupData.cookiesSettings.whitelist.domains.splice(domainIndex, 1);
    };

    /***************************************************************************/

    var onDomainBlacklistClick = function () {
        var state = isCookieDomainBlacklisted(popupData.pageDomain);

        if (state)
            return;

        setDomainBlacklistState(!state);
        reloadTab();
        vAPI.closePopup();

        // var whitelisted = isCookieDomainWhitelisted(popupData.pageDomain);
        // if (whitelisted) {
        //     setDomainWhitelistState(!whitelisted);
        // }
    };

    var setDomainBlacklistState = function (state) {
        // Add\remove domain to blacklist locally.
        // TODO: if we'll reload a tab after button clicked - remove this line
        if (state) {
            popupData.cookiesSettings.blacklist.domains.push(popupData.pageDomain);
        }
        else
            rmDomainFromBlacklist();

        showDomainBlacklistState();

        messager.send('popupPanel', {
            what:  'toggleCookiesDomainBlacklist',
            domain:   popupData.pageDomain,
            state: state
        });
    };

    var showDomainBlacklistState = function () {
        $('#cookies_tab .domain-cookies-plate')
            .toggleClass('blacklisted-domain', isCookieDomainBlacklisted(popupData.pageDomain));
    };

    var isCookieDomainBlacklisted = function (domain) {
        if (!popupData || !popupData.cookiesSettings || !popupData.cookiesSettings.blacklist)
            return false;

        return popupData.cookiesSettings.blacklist.domains.indexOf(domain) !== -1;
    };

    /**
     * Current method used only for removing from local variable "popupData.cookiesSettings.blacklist.domains"
     */
    var rmDomainFromBlacklist = function () {
        let domainIndex = popupData.cookiesSettings.blacklist.domains.indexOf(popupData.pageDomain);
        if (domainIndex !== -1)
            popupData.cookiesSettings.blacklist.domains.splice(domainIndex, 1);
    };

    /***************************************************************************/

    var resetCookiesDomainState = function () {
        messager.send('popupPanel', {
            what:  'resetCookiesDomain',
            domain:   popupData.pageDomain
        });

        // setDomainWhitelistState(false);
        // setDomainBlacklistState(false);
        reloadTab();
        vAPI.closePopup();
    };

    /***************************************************************************/

    var handleAdvancedSettingsBtn = function () {
        $('.advanced-settings-btn').off("click");
        $('.advanced-settings-btn').on("click", openOptionsPage);
    };

    /***************************************************************************/

    var handleCookiesSettings = function () {
        $('.third-party-blocking-setting .setting-state-switcher input').off("change");
        $('.third-party-blocking-setting .setting-state-switcher input').on("change", onThirdPartySettingSwitch);

        $('.periodical-cookies-clearing-setting .setting-state-switcher input').off("change");
        $('.periodical-cookies-clearing-setting .setting-state-switcher input').on("change", onPeriodicalClearingSettingSwitch);
    };

    var renderCookiesSettings = function () {
        if (popupData.cookiesSettings.thirdPartyCookiesBlocking)
            $('.third-party-blocking-setting .setting-state-switcher input')
                .attr('checked', popupData.cookiesSettings.thirdPartyCookiesBlocking);

        if (popupData.cookiesSettings.periodicalClearing)
            $('.periodical-cookies-clearing-setting .setting-state-switcher input')
                .attr('checked', popupData.cookiesSettings.periodicalClearing);
    };

    var onThirdPartySettingSwitch = function () {
        popupData.cookiesSettings.thirdPartyCookiesBlocking = !popupData.cookiesSettings.thirdPartyCookiesBlocking;
        messager.send(
            'popupPanel',
            {
                what: 'changeCookiesSettings',
                name: 'thirdPartyCookiesBlocking',
                value: popupData.cookiesSettings.thirdPartyCookiesBlocking
            }
        );
    };

    var onPeriodicalClearingSettingSwitch = function () {
        popupData.cookiesSettings.periodicalClearing = !popupData.cookiesSettings.periodicalClearing;
        messager.send(
            'popupPanel',
            {
                what: 'changeCookiesSettings',
                name: 'periodicalClearing',
                value: popupData.cookiesSettings.periodicalClearing
            }
        );
    };

    /***************************************************************************/

    var cookies = [];

    var renderCookiesList = function () {
        cookies = [];
        var divCookieList = $('.domain-cookies-list .collapsible-body');
        divCookieList.html("");

        if (!popupData.cookies)
            return;

        sortCookiesList();

        popupData.cookies.forEach(function (cookieData) {
            let cookieItem = new CookieItem(cookieData, CookieItem.type.MAIN_DOMAIN);
            cookieItem.appendTo(divCookieList);
            cookies.push(cookieItem);
        });
    };

    /**
     * Sort order
     * 1) Whitelist
     * 2) No State
     * 3) Blacklist
     */
    var sortCookiesList = function () {
        popupData.cookies = popupData.cookies.sort(function(a, b) {
            let typeA = a.whitelisted ? 1 : (a.blacklisted ? 3 : 2);
            let typeB = b.whitelisted ? 1 : (b.blacklisted ? 3 : 2);
            return typeA > typeB;
        });
    };

    /***************************************************************************/

    var CookieItem = function (initData, type) {
        this.cookieData = initData;
        this.divElement = null;

        this.cookieType = type ? type : CookieItem.type.DOMAIN;

        this.divDetailsWrapper = null;

        this.init();
    };

    /**
     * Current property used for detecting a place where cookie item is displayed.
     * Cookie item can be placed in a main "Cookies" tab. In this case cookie details dialog
     *      must be placed in this tab.
     * And cookie item can be placed in "Cookie control" feature pages. In this case cookie details dialog
     *      must be expanded to all page.
     */
    Object.defineProperty(CookieItem, 'type', {
        value: {
            MAIN_DOMAIN: 1, // Cookie item of domain opened in a tab.
            DOMAIN: 0 // Cookie item of domain from "Cookie control" pages
        },
        writable: false
    });
    Object.defineProperty(CookieItem, 'ITEM_TMPLT', {
        value: $('#cookie_item_template').html(),
        writable: false
    });
    Object.defineProperty(CookieItem, 'DETAILS_TMPLT', {
        value: $('#cookie_details_template').html(),
        writable: false
    });



    CookieItem.prototype.init = function () {
        this.divElement = $(Mustache.render(CookieItem.ITEM_TMPLT, this.cookieData));
        this.handleDetailsBtn();
    };

    CookieItem.prototype.handleDetailsBtn = function () {
        var btnDetails = $(this.divElement).find('.cookie-control.cookie-details-btn');
        btnDetails.off('click');
        btnDetails.on('click', function (ev) {
            this.createDetailsWnd();
            this.openDetails();
        }.bind(this));
    };

    CookieItem.prototype.appendTo = function (divParent) {
        if (!divParent) return;

        $(divParent).append(this.divElement);
    };

    CookieItem.prototype.createDetailsWnd = function () {
        // If details window was already created and added to a DOM
        if (this.divDetailsWrapper && this.divDetailsWrapper.length) {
            return;
        }

        // Details window in a Cookies tab
        if (this.cookieType === CookieItem.type.MAIN_DOMAIN) {
            this.divDetailsWrapper =
                $('<div class="cookie-details-dialog" data-cookie-name="'
                    + this.cookieData.name + '"></div>');
            $("#main_page .main-tabs-slider").append(this.divDetailsWrapper);
        }

        // Parse expire date for displaying in details a popup
        this.cookieData.expirationParsed = '';
        if (this.cookieData.expirationDate) {
            this.cookieData.expirationParsed =
                (new Date(this.cookieData.expirationDate * 1000)).toUTCString();
        }
        else if (this.cookieData.session) { // Session cookies hasn't expirationDate prop
            this.cookieData.expirationParsed =
                vAPI.i18n.prepareTemplateText(vAPI.i18n('popupCookieDetailsExpiresSession'));
        }

        this.divDetailsWnd = $(Mustache.render(CookieItem.DETAILS_TMPLT, this.cookieData));
        this.divDetailsWnd.find('[data-i18n]').each(function(index, elem) {
            $(elem).html(vAPI.i18n.prepareTemplateText(vAPI.i18n($(elem).attr('data-i18n'))));
        });

        this.handleDetailsWnd();
        this.divDetailsWrapper.append(this.divDetailsWnd);
    };

    CookieItem.prototype.handleDetailsWnd = function () {
        this.divDetailsWnd.find('.close-cookie-details-btn').off('click');
        this.divDetailsWnd.find('.close-cookie-details-btn').on('click', function (ev) {
            this.closeDetails();
        }.bind(this));

        this.divDetailsWnd.find('.cookie-prop-value-full').on('mouseover', function (ev) {
            var divItem = $(ev.currentTarget);

            // Expand full value only if collapsed container has two lines of text
            if (divItem.hasClass('cookie-prop-value') && divItem.height() > 12)
                divItem.removeClass('cookie-prop-value');
        }.bind(this));
        this.divDetailsWnd.find('.cookie-prop-value-full').on('mouseout', function (ev) {
            var divItem = $(ev.currentTarget);
            if (!divItem.hasClass('cookie-prop-value'))
                divItem.addClass('cookie-prop-value');
        }.bind(this));

        this.handleWhitelistBtn();
        this.handleBlacklistBtn();
        this.handleRemoveBtn();
    };

    CookieItem.prototype.handleWhitelistBtn = function () {
        this.divDetailsWnd.find('.cookie-whitelist-btn').off('click');
        this.divDetailsWnd.find('.cookie-whitelist-btn').on('click', function (ev) {
            this.setWhitelistSate(!this.cookieData.whitelisted);
            this.setBlacklistState(false); // Always remove from blacklist
            reloadTab();
            vAPI.closePopup();
        }.bind(this));
    };

    CookieItem.prototype.setWhitelistSate = function (state) {
        this.cookieData.whitelisted = state;
        messager.send(
            'popupPanel',
            {
                what: 'setCookieWhitelist',
                cookie: this.cookieData,
                state: this.cookieData.whitelisted
            }
        );

        this.divElement.toggleClass('whitelisted-cookie', this.cookieData.whitelisted);
        this.divDetailsWnd.toggleClass('whitelisted-cookie', this.cookieData.whitelisted);
    };

    CookieItem.prototype.handleBlacklistBtn = function () {
        this.divDetailsWnd.find('.cookie-blacklist-btn').off('click');
        this.divDetailsWnd.find('.cookie-blacklist-btn').on('click', function (ev) {
            this.setBlacklistState(!this.cookieData.blacklisted);
            this.setWhitelistSate(false); // Always remove from whitelist
            reloadTab();
            vAPI.closePopup();
        }.bind(this));
    };

    CookieItem.prototype.setBlacklistState = function (state) {
        this.cookieData.blacklisted = state;
        messager.send(
            'popupPanel',
            {
                what: 'setCookieBlacklist',
                cookie: this.cookieData,
                state: this.cookieData.blacklisted
            }
        );

        this.divElement.toggleClass('blacklisted-cookie', this.cookieData.blacklisted);
        this.divDetailsWnd.toggleClass('blacklisted-cookie', this.cookieData.blacklisted);
    };

    CookieItem.prototype.handleRemoveBtn = function () {
        this.divDetailsWnd.find('.remove-cookie-btn').off('click');
        this.divDetailsWnd.find('.remove-cookie-btn').on('click', function (ev) {
            messager.send(
                'popupPanel',
                {
                    what: 'removeCookie',
                    cookie: this.cookieData,
                    state: this.cookieData.blacklisted
                }
            );

            reloadTab();
            vAPI.closePopup();
        }.bind(this));
    };


    CookieItem.prototype.openDetails = function () {
        this.divDetailsWrapper.addClass('active');
    };

    CookieItem.prototype.closeDetails = function () {
        this.divDetailsWrapper.removeClass('active');
    };

    /***************************************************************************/

    var renderPopup = function (isInitial) {
        if (isInitial) {
            if (popupData.activePopupTab) {
                switchToMainPageTab(popupData.activePopupTab);
            }
            else {
                switchToMainPageTab("protection_tab");
            }
        }

        $('body').toggleClass('system-page', !popupData.canElementPicker);


        // Protection tab
        $(".protection-status-plate .plate-content-title").text(popupData.pageHostname);
        $(".blocked-on-site-plate .plate-content-text span").text(popupData.pageBlockedRequestCount);
        $(".blocked-total-plate .plate-content-text span").text(popupData.globalBlockedRequestCount);

        //Status bar
        showTodayBlockedCount();

        //Protection tab
        showWhitelistStatus();
        showProtectionStoppedStatus();
        showSocialBlockingStatus();

        // Cookies
        renderCookiesTab();

        // ProtectionLists
        renderTrackedUrls();
        displayUsedFilters(isInitial);
        updateFiltersTitleTooltips();

        $("#protection_tab").mCustomScrollbar({
            // scrollInertia: 0,
            autoHideScrollbar: false,
            scrollButtons:{ enable: false },
            advanced:{ updateOnContentResize: true },
            mouseWheel:{
                scrollAmount: 150
            }
        });

        $("#cookies_tab").mCustomScrollbar({
            // scrollInertia: 0,
            autoHideScrollbar: false,
            scrollButtons:{ enable: false },
            advanced:{ updateOnContentResize: true },
            mouseWheel:{
                scrollAmount: 150
            }
        });

        $(".protection-lists-page-content").mCustomScrollbar({
            // scrollInertia: 0,
            autoHideScrollbar: false,
            scrollButtons:{ enable: false },
            advanced:{ updateOnContentResize: true },
            mouseWheel:{
                scrollAmount: 150
            }
        });
    };

    /***************************************************************************/

    var getPopupData = function (tabId, isInitial) {
        var onDataReceived = function (response) {
            cachePopupData(response);
            renderPopup(isInitial);
            pollForContentChange();
        };
        messager.send('popupPanel',
            { what: 'getPopupData', tabId: tabId },
            onDataReceived
        );
    };



    uDom.onLoad(function () {
        initializeMaterialControls();

        filterItemTmplt = $("#filter_template").text();

        // If there's no tab id specified in the query string,
        // it will default to current tab.
        var tabId = null;

        // Extract the tab id of the page this popup is for
        var matches = window.location.search.match(/[\?&]tabId=([^&]+)/);
        if ( matches && matches.length === 2 ) {
            tabId = matches[1];
        }
        getPopupData(tabId, true);

        handleControls();

        $("#search_input").focus();
    });

})();
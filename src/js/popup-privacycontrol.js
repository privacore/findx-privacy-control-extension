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

    var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

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
            if (typeof hostnameDict[hostname] === 'object' && typeof hostnameDict[hostname].domain !== 'undefined') {
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
        M.Tooltip.init(document.querySelector("#protection_status_btn"), {enterDelay: 300});
        M.Tooltip.init(document.querySelector("#pause_site_btn"), {enterDelay: 300});
        M.Tooltip.init(document.querySelector(".element-picker-btn"), {enterDelay: 300});
        M.Tooltip.init(document.querySelector(".user-filters-btn"), {enterDelay: 300});
        M.Tooltip.init(document.querySelector(".open-protection-lists-btn"), {enterDelay: 300});

        M.Tooltip.init(document.querySelector(".domain-cookies-reset-btn"), {enterDelay: 300});

        var footerLogo = document.querySelector('.footer-btn.logo');
        M.Tooltip.init(footerLogo, {enterDelay: 500});

        var footerFavBtn = document.querySelector('.footer-btn.fav-btn');
        if (isFirefox())
            footerFavBtn.setAttribute('data-tooltip', vAPI.i18n('popupTipFooterRateAddon'))
        else
            footerFavBtn.setAttribute('data-tooltip', vAPI.i18n('popupTipFooterRateExtension'))

        M.Tooltip.init(footerFavBtn, {enterDelay: 500});

        M.Tooltip.init(document.querySelector('#listed_sites_page .fixed-action-btn .btn-floating'), {enterDelay: 500});
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
        handleMyFiltersBtn();

        handleStartProtectionBtn();

        // Cookies tab
        handleCookiesTab();

        // Cookie control page
        handleCookieControlPageBackBtn();
        handleCookieControlPageItems();

        // Whitelised/Blacklisted sites pages and All sites page
        handleListedSitesPage();

        handleDomainCookiesPage();

        handleSocialBlocking();

        handleUserFiltersPage();

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
        $('.open-protection-lists-btn').on('click', function (ev) {
            openPage(PAGES.protection_lists);
        });
    };

    var handleCloseProtectionListsBtn = function () {
        $('#close_protection_lists').off('click');
        $('#close_protection_lists').on('click', function (ev) {
            openPage(PAGES.main);
        });
    };

    /**
     * Handle search button located in a hedaer of "Protection lists" page
     */
    var handleOpenSearchTabBtn = function () {
        $('.page .header .open-search-tab-btn').off('click');
        $('.page .header .open-search-tab-btn').on('click', function (ev) {
            switchToMainPageTab('search_tab');
            openPage(PAGES.main);
            $("#search_input").focus();
        });
    };

    /***************************************************************************/

    var PAGES = {
        'main': 'main_page',
        'protection_lists': 'protection_lists_page',
        'user_filters': 'user_filters_page',
        'cookie_control': 'cookie_control_page',
        'whitelisted_sites': 'listed_sites_page',
        'blacklisted_sites': 'listed_sites_page',
        'all_sites': 'listed_sites_page',
        'domain_cookies': 'domain_cookies_page'
    };

    var openPage = function (pageId) {
        $(".page").removeClass('active');
        $("#" + pageId).addClass('active');
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

        sidebarLinks.on("click", function(ev) {
            onSidebarLinkClick($(ev.currentTarget).attr("data-action"))

            // When clicking on the link in the popover, the user moves to the address within this popover.
            // To open the address in a new window, it is required to prevent the default browser behavior.
            stopEvent(ev);
        });
    };

    var closeSidebar = function () {
        if (sideNav)
            sideNav.close();
    };

    var onSidebarLinkClick = function (action) {
        switch (action) {
            case "protection_lists":
                openOptionsPage();
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
        openPage(PAGES.main);
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
        $('.page .header .settings-btn').off("click");
        $('.page .header .settings-btn').on("click", openOptionsPage);
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

    /**
     * "My filters" button in a Protection tab.
     * Used to open "User filters" page.
     */
    var handleMyFiltersBtn = function () {
        $(".user-filters-btn").off("click");
        $(".user-filters-btn").on("click", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();

            openPage(PAGES.user_filters);
        });
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

            if (filterData.id === 'user-filters') {
                elFilter = $(Mustache.render($('#user_filter_template').text(), filterData));
            }
            else
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

                // Open User filters page if "My filters" item was clicked
                if (filterData.id === 'user-filters') {
                    openPage(PAGES.user_filters);
                }
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



    /**************************** User filters page *********************************/

    var cosmeticRulesData = [];

    var renderUserFiltersCosmetic = function (rules) {
        console.log ("renderUserFiltersCosmetic ()            popup-privacycontrol.js" +
            "\n\t rules: ", rules);

        cosmeticRulesData = [];
        var userFilter = popupData.usedFilters['user-filters'];

        if (isFilterEnabled(userFilter)) {
            cosmeticRulesData = rules;
        }

        setUserFiltersQty();

        clearUserCosmeticRulesList();
        renderUserCosmeticRules()
    };

    var handleUserFiltersPage = function () {
        $('#user_filters_page .header .back-btn').off("click");
        $('#user_filters_page .header .back-btn').on("click", function (ev) {
            openPage(PAGES.protection_lists);
        });

        var floatingBtn = $('#user_filters_page .btn-floating');
        M.Tooltip.init(floatingBtn, {enterDelay: 500});
        floatingBtn.off("click");
        floatingBtn.on("click", function (ev) {
            if (ev.currentTarget.classList.contains('btn-floating__refresh')) {
                // If some changes was made on a page.
                reloadTab();
                vAPI.closePopup();
            }
            else {
                if (popupData.canElementPicker === true)
                    gotoPick();
            }
        });
    };

    var setUserFiltersQty = function () {
        var blockedQty = cosmeticRulesData.filter(function (rule) {
            return !rule.whitelisted;
        }).length;
        $('.user-filter .filter-counts .rules-blocked-count').html(blockedQty);
        $('.user-filter .filter-counts .rules-total-count').html(cosmeticRulesData.length);
    };

    var clearUserCosmeticRulesList = function () {
        cosmeticRules.forEach(function (cosmeticRule) {
            cosmeticRule.destroy();
        });
        cosmeticRules = [];
        $('.user-filters-lists').html('');
    };

    var cosmeticRules = [];

    var CosmeticRule = function (ruleData, filterName) {
        this.elItem = null;
        this.elParent = null;
        this.ruleData = ruleData || {};
        this.ruleData.fullData = JSON.stringify(this.ruleData);
        this.filterName = filterName || "";
        this.template = $('#cosmetic_rule_template').text();

        this.btnHide = null;
        this.btnRemove = null;
    };

    CosmeticRule.prototype.createElement = function () {
        this.elItem = $(Mustache.render(this.template, this.ruleData));
    };

    CosmeticRule.prototype.appendTo = function (elParent) {
        if (!this.elParent) {
            this.elParent = $(elParent);
        }
        if (!this.elItem)
            this.createElement();

        $(elParent).append(this.elItem);
        setTimeout(function () {
            this.elItem = $(this.elParent).find(".cosmetic-rule[data-rule='" + this.ruleData.raw + "']");
            this.btnHide = this.elItem.find('.cosmetic-rule_whitelist_btn');
            this.btnRemove = this.elItem.find('.cosmetic-rule_remove_btn');
            this.setControlsHandlers();
        }.bind(this), 300);
    };

    CosmeticRule.prototype.setControlsHandlers = function () {
        $(this.btnHide).off('click');
        $(this.btnHide).on('click', this.onHideClick.bind(this));

        $(this.btnRemove).off('click');
        $(this.btnRemove).on('click', this.onRemoveClick.bind(this));
    };

    CosmeticRule.prototype.onHideClick = function (ev) {
        this.ruleData.whitelisted = !this.ruleData.whitelisted;

        messager.send('popupPanel', {
            what:  'setUserCosmeticRuleWhitelistState',
            filterPath: this.filterName,
            domain: popupData.pageDomain,
            rule: this.ruleData,
            whitelist: this.ruleData.whitelisted
        });

        $(this.elItem).toggleClass('cosmetic-rule__whitelisted');
        onUserCosmeticRuleUpdated();
    };

    CosmeticRule.prototype.onRemoveClick = function (ev) {
        messager.send('popupPanel', {
            what:  'rmUserCosmeticRule',
            filterPath: this.filterName,
            domain: popupData.pageDomain,
            rule: this.ruleData,
            whitelist: this.ruleData.whitelisted
        });

        onUserCosmeticRuleUpdated();
        this.destroy();
    };

    CosmeticRule.prototype.destroy = function () {
        this.elParent = null;
        $(this.btnHide).off('click');
        this.btnHide = null;
        $(this.btnRemove).off('click');
        this.btnRemove = null;
        this.filterName = null;

        this.elItem.remove();
        this.elItem = null;
    };



    var renderUserCosmeticRules = function () {
        var elRulesList = $('.user-filters-lists');

        cosmeticRulesData.forEach(function (ruleData) {
            var rule = new CosmeticRule(ruleData, 'user-filters');
            rule.appendTo(elRulesList);

            cosmeticRules.push(rule);
        });
    };

    var onUserCosmeticRuleUpdated = function () {
        $('#user_filters_page').toggleClass('content-changed', true);

        var floatingBtn = $('#user_filters_page .btn-floating');
        floatingBtn.toggleClass('btn-floating__refresh', true);
        if (floatingBtn[0].hasAttribute('data-tooltip')) {
            $(floatingBtn).attr('data-tooltip', vAPI.i18n('popupTipRefreshBtn'));
            M.Tooltip.init(floatingBtn, {enterDelay: 500});
        }
    };



    /***************************************************************************/
    /******************************** COOKIES ***********************************/

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

        handleCookieControlSettingBtn();
    };

    /**
     * Handle "Remove all" button in the Cookies tab domain plate
     */
    var handleRemoveAllCookiesBtn = function () {
        $("#domain_cookies_remove_btn").off('click');
        $("#domain_cookies_remove_btn").on('click', function (ev) {
            if (isNoDomainCookies()) {
                return;
            }

            rmTabDomainCookies(popupData.pageDomain, function () {
                reloadTab();
                vAPI.closePopup();
            });
        });
    };

    /**
     * Remove all unprotected cookies of domain opened in a tab.
     * If cookie isn't whitelisted/blacklisted - set it temporary to a blacklist.
     * After page reload temporary blacklist will be cleared.
     * @param {string} [domain]
     * @param {Function} [callback]
     */
    var rmTabDomainCookies = function (domain, callback) {
        let cookies = getDomainRegularCookies();

        messager.send('popupPanel', {
            what:  'temporaryBlacklistCookies',
            cookies: cookies
        }, function () {
            messager.send('popupPanel', {
                what:  'removeDomainCookies',
                domain: domain
            });
            if (callback)
                callback();
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
        showCookiesDomain();

        if (!isSafari) {
            showDomainWhitelistState();
            showDomainBlacklistState();
            showCookiesQuantity();
            updateNoCookies();
            renderCookiesSettings();
            renderCookiesList();
        }
        else {
            document.querySelector('body').classList.add('platform-safari');
            $('.safari-cookies-dialog-btn').off('click');
            $('.safari-cookies-dialog-btn').on('click', function (ev) {
                let type = ev.currentTarget.getAttribute('data-type') || "";
                messager.send('popupPanel', {what: 'openGetExtensionPage', type: type});
                vAPI.closePopup();
            });
        }
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
        $("#cookies_tab .domain-cookies-count-total").text(getTotalDomainCookiesQty());
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

    var getTotalDomainCookiesQty = function () {
        return popupData.cookies ? popupData.cookies.length || 0 : 0;
    };

    /***************************************************************************/

    /**
     * We count only whitelisted/blacklisted and cookies which were not blocked.
     * If separate cookie was blocked and it is not blacklisted -
     *      don't count it, we don't show such cookies in a list.
     * @returns {boolean}
     */
    var isNoDomainCookies = function () {
        let cookiesExists = false;
        if (popupData && popupData.cookies) {
            cookiesExists = popupData.cookies.some(function (cookie) {
                return (!cookie.removed || (cookie.removed && cookie.blacklisted));
            });
        }

        return !cookiesExists;
    };

    /***************************************************************************/

    /**
     * Returns a list of cookies which aren't whitelisted/blacklisted.
     * Current list used for temporary blacklisting after user clicks "Remove all" in a Cookies tab.
     * @returns {Cookie[]}
     */
    var getDomainRegularCookies = function () {
        let list = [];

        popupData.cookies.forEach(function (cookie) {
            if (!cookie.removed && !isCookieWhitelisted(cookie) && !isCookieBlacklisted(cookie)) {
                list.push(cookie);
            }
        });

        return list;
    };

    /***************************************************************************/

    var onDomainWhitelistClick = function () {
        var state = isCookieDomainWhitelisted(popupData.pageDomain);
        if (state)
            return;

        setDomainWhitelistState(popupData.pageDomain, !state);
        if (!state)
            setDomainBlacklistState(popupData.pageDomain, false);
        // showDomainWhitelistState();
        reloadTab();
        vAPI.closePopup();
    };

    var setDomainWhitelistState = function (domain, state) {
        // Add domain to whitelist locally.
        if (state)
            popupData.cookiesSettings.whitelist.domains.push(domain);
        else
            rmDomainFromWhitelist(domain);

        messager.send('popupPanel', {
            what:  'toggleCookiesDomainWhitelist',
            domain:   domain,
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
    var rmDomainFromWhitelist = function (domain) {
        let domainIndex = popupData.cookiesSettings.whitelist.domains.indexOf(domain);
        if (domainIndex !== -1)
            popupData.cookiesSettings.whitelist.domains.splice(domainIndex, 1);
    };

    /***************************************************************************/

    var onDomainBlacklistClick = function () {
        var state = isCookieDomainBlacklisted(popupData.pageDomain);

        if (state)
            return;

        setDomainBlacklistState(popupData.pageDomain, !state);
        if (!state)
            setDomainWhitelistState(popupData.pageDomain, false);
        reloadTab();
        vAPI.closePopup();
    };

    var setDomainBlacklistState = function (domain, state) {
        // Add\remove domain to blacklist locally.
        if (state) {
            popupData.cookiesSettings.blacklist.domains.push(domain);
        }
        else
            rmDomainFromBlacklist(domain);

        messager.send('popupPanel', {
            what:  'toggleCookiesDomainBlacklist',
            domain:   domain,
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
    var rmDomainFromBlacklist = function (domain) {
        let domainIndex = popupData.cookiesSettings.blacklist.domains.indexOf(domain);
        if (domainIndex !== -1)
            popupData.cookiesSettings.blacklist.domains.splice(domainIndex, 1);
    };

    /***************************************************************************/

    var resetCookiesDomainState = function () {
        messager.send('popupPanel', {
            what:  'resetCookiesDomain',
            domain:   popupData.pageDomain
        });

        reloadTab();
        vAPI.closePopup();
    };

    /***************************************************************************/

    var handleAdvancedSettingsBtn = function () {
        $('.advanced-settings-btn').off("click");
        $('.advanced-settings-btn').on("click", openOptionsPage);
    };

    /*************************** Cookies tab settings ********************************/

    var handleCookiesSettings = function () {
        $('.third-party-blocking-setting .setting-state-switcher input').off("change");
        $('.third-party-blocking-setting .setting-state-switcher input').on("change", onThirdPartySettingSwitch);

        $('.periodical-cookies-clearing-setting .setting-state-switcher input').off("change");
        $('.periodical-cookies-clearing-setting .setting-state-switcher input').on("change", onPeriodicalClearingSettingSwitch);
    };

    var renderCookiesSettings = function () {
        // Third party blocking
        if (popupData.cookiesSettings.thirdPartyCookiesBlocking)
            $('.third-party-blocking-setting .setting-state-switcher input')
                .attr('checked', popupData.cookiesSettings.thirdPartyCookiesBlocking);

        // Sub title text changes after user enable/disable setting
        $('.third-party-blocking-setting .list-item-subtitle').html(
            vAPI.i18n.prepareTemplateText(popupData.cookiesSettings.thirdPartyCookiesBlocking ?
                vAPI.i18n('popupCookiesThirdPartySubTitleBlocked')
                : vAPI.i18n('popupCookiesThirdPartySubTitleAllowed')));


        // Periodical clearing
        if (popupData.cookiesSettings.periodicalClearing)
            $('.periodical-cookies-clearing-setting .setting-state-switcher input')
                .attr('checked', popupData.cookiesSettings.periodicalClearing);

        // Sub title text changes after user enable/disable setting
        $('.periodical-cookies-clearing-setting .list-item-subtitle').html(
            vAPI.i18n.prepareTemplateText(popupData.cookiesSettings.periodicalClearing ?
                vAPI.i18n('popupCookiesPeriodicalClearingSubTitleDisabled')
                : vAPI.i18n('popupCookiesPeriodicalClearingSubTitleEnabled')));
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

        renderCookiesSettings();
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

        renderCookiesSettings();
    };

    /***************************************************************************/

    var cookies = [];

    var renderCookiesList = function () {
        cookies = [];
        var divCookieList = $('#cookies_tab .domain-cookies-list .collapsible-body');
        divCookieList.html("");

        if (!popupData.cookies)
            return;

        popupData.cookies = sortCookiesList(popupData.cookies);

        popupData.cookies.forEach(function (cookieData) {
            // Show in a list only cookies which are whitelisted/blacklisted or were not blocked.
            // Cookie blocked because of domain blacklisting shouldn't be shown.
            if (cookieData.removed && !cookieData.blacklisted)
                return;

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
     * @param {object[]} cookiesList
     */
    var sortCookiesList = function (cookiesList) {
        return cookiesList.sort(function(a, b) {
            let typeA = a.whitelisted ? 1 : (a.blacklisted ? 3 : 2);
            let typeB = b.whitelisted ? 1 : (b.blacklisted ? 3 : 2);

            if (typeA > typeB)
                return 1;
            else if (typeA < typeB)
                return -1;
            else return 0;
        });
    };

    /******************************* Cookie item **********************************/

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


        this.divDetailsWrapper =
            $('<div class="cookie-details-dialog" data-cookie-name="'
                + this.cookieData.name + '"></div>');

        // Details window in a Cookies tab
        if (this.cookieType === CookieItem.type.MAIN_DOMAIN) {
            $("#main_page .main-tabs-slider").append(this.divDetailsWrapper);
        }
        else if (this.cookieType === CookieItem.type.DOMAIN) {
            $("#domain_cookies_page .domain-cookies-page-content").append(this.divDetailsWrapper);
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

        this.divDetailsWnd.find('[data-tooltip]').each(function(index, elem) {
            var tooltip = vAPI.i18n.prepareTemplateText(vAPI.i18n($(elem).attr('data-tooltip')));
            if ( tooltip ) {
                $(elem).attr('data-tooltip', tooltip);
            }

            M.Tooltip.init(elem, {enterDelay: 300});
        });

        this.handleDetailsWnd();
        this.divDetailsWrapper.append(this.divDetailsWnd);
    };

    CookieItem.prototype.handleDetailsWnd = function () {
        this.divDetailsWnd.find('.close-cookie-details-btn').off('click');
        this.divDetailsWnd.find('.close-cookie-details-btn').on('click', function (ev) {
            this.closeDetails();
        }.bind(this));

        this.divDetailsWrapper.off('click');
        this.divDetailsWrapper.on('click', function (ev) {
            if (ev.target === ev.currentTarget) {
                this.closeDetails();
            }
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
        this.handleResetBtn();
    };

    CookieItem.prototype.handleWhitelistBtn = function () {
        this.divDetailsWnd.find('.cookie-whitelist-btn').off('click');
        this.divDetailsWnd.find('.cookie-whitelist-btn').on('click', function (ev) {
            if (this.cookieData.whitelisted)
                return;

            this.setWhitelistSate(!this.cookieData.whitelisted);
            this.setBlacklistState(false); // Always remove from blacklist
            if (this.cookieType === CookieItem.type.MAIN_DOMAIN) {
                reloadTab();
                vAPI.closePopup();
            }
            else if (this.cookieType === CookieItem.type.DOMAIN) {
                this.closeDetails();
            }
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


        let whitelistedIndex = popupData.cookiesSettings.whitelist.cookies.findIndex(function (cookieItem) {
            return cookieItem.name === this.cookieData.name && cookieItem.domain === this.cookieData.domain;
        }.bind(this));
        if(this.cookieData.whitelisted) {
            // Add cookie to a local whitelist
            if (whitelistedIndex === -1) {
                popupData.cookiesSettings.whitelist.cookies.push({name: this.cookieData.name, domain: this.cookieData.domain});
            }
        }
        else {
            // Remove cookie from a local whitelist
            if (whitelistedIndex !== -1) {
                popupData.cookiesSettings.whitelist.cookies.splice(whitelistedIndex, 1);
            }
        }
    };

    CookieItem.prototype.handleBlacklistBtn = function () {
        this.divDetailsWnd.find('.cookie-blacklist-btn').off('click');
        this.divDetailsWnd.find('.cookie-blacklist-btn').on('click', function (ev) {
            if (this.cookieData.blacklisted)
                return;

            this.setBlacklistState(!this.cookieData.blacklisted);
            this.setWhitelistSate(false); // Always remove from whitelist
            if (this.cookieType === CookieItem.type.MAIN_DOMAIN) {
                reloadTab();
                vAPI.closePopup();
            }
            else if (this.cookieType === CookieItem.type.DOMAIN) {
                this.closeDetails();
            }
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

        let blacklistedIndex = popupData.cookiesSettings.blacklist.cookies.findIndex(function (cookieItem) {
            return cookieItem.name === this.cookieData.name && cookieItem.domain === this.cookieData.domain;
        }.bind(this));
        if(this.cookieData.blacklisted) {
            // Add cookie to a local whitelist
            if (blacklistedIndex === -1) {
                popupData.cookiesSettings.blacklist.cookies.push({name: this.cookieData.name, domain: this.cookieData.domain});
            }
        }
        else {
            // Remove cookie from a local whitelist
            if (blacklistedIndex !== -1) {
                popupData.cookiesSettings.blacklist.cookies.splice(blacklistedIndex, 1);
            }
        }
    };

    CookieItem.prototype.handleRemoveBtn = function () {
        this.divDetailsWnd.find('.remove-cookie-btn').off('click');
        this.divDetailsWnd.find('.remove-cookie-btn').on('click', function (ev) {
            messager.send(
                'popupPanel',
                {
                    what: 'removeCookie',
                    cookie: this.cookieData
                }
            );

            if (this.cookieType === CookieItem.type.MAIN_DOMAIN) {
                // If cookie is a first party cookie of a domain opened in current tab -
                //  remove it from whitelist/blacklist after removing this cookie from browser
                this.setWhitelistSate(false);
                this.setBlacklistState(false);

                reloadTab();
                vAPI.closePopup();
            }
            else {
                rmCookieFromAllSitesPage(this.cookieData);
                rmCookieFromDomainCookiesList(this.cookieData);
                this.closeDetails();
                this.remove();
            }
        }.bind(this));
    };

    CookieItem.prototype.handleResetBtn = function () {
        this.divDetailsWnd.find('.cookie-reset-btn').off('click');
        this.divDetailsWnd.find('.cookie-reset-btn').on('click', function (ev) {
            this.setBlacklistState(false);
            this.setWhitelistSate(false);

            if (this.cookieType === CookieItem.type.MAIN_DOMAIN) {
                reloadTab();
                vAPI.closePopup();
            }
            else if (this.cookieType === CookieItem.type.DOMAIN) {
                this.closeDetails();
            }
        }.bind(this));
    };


    CookieItem.prototype.openDetails = function () {
        this.divDetailsWrapper.addClass('active');
    };

    CookieItem.prototype.closeDetails = function () {
        this.divDetailsWrapper.removeClass('active');
    };

    CookieItem.prototype.remove = function () {
        this.divElement.remove();
    };

    /************************** Cookie control page *********************************/

    var handleCookieControlSettingBtn = function () {
        $('.cookie-control-setting').off("click");
        $('.cookie-control-setting').on("click", function (ev) {
            openPage(PAGES.cookie_control);
        });
    };

    var handleCookieControlPageBackBtn = function () {
        $('#close_cookie_control_page').off("click");
        $('#close_cookie_control_page').on("click", function (ev) {
            openPage(PAGES.main);
        });
    };

    var handleCookieControlPageItems = function () {
        $("#cookie_control_page .items-list .list-item").off('click');
        $("#cookie_control_page .items-list .list-item").on('click', function (ev) {
            var itemType = $(ev.currentTarget).attr('data-item-type');

            switch (itemType) {
                case 'all':
                    renderListedSitesPage('all');
                    openPage(PAGES.all_sites);
                    break;
                case 'whitelisted':
                    renderListedSitesPage('whitelist');
                    openPage(PAGES.whitelisted_sites);
                    break;
                case 'blacklisted':
                    renderListedSitesPage('blacklist');
                    openPage(PAGES.blacklisted_sites);
                    break;
            }
        });
    };

    /***************************************************************************/
    /**************************** Listed cookies page *******************************/

    var allCookies = new Map();

    var parseAllCookiesBySites = function () {
        allCookies.clear();
        if (!popupData.allCookies || !popupData.allCookies.length)
            return;

        popupData.allCookies.forEach(function (cookie) {
            let cookieDomain = getRootDomain(cookie.domain);
            let domainCookies = allCookies.get(cookieDomain)
            if (!domainCookies) {
                domainCookies = [];
            }

            domainCookies.push(cookie);

            allCookies.set(cookieDomain, domainCookies);
        });
    };

    var getRootDomain = function (domain) {
        if (domain.charAt(0) === '.') {
            domain = domain.slice(1);
        }
        return publicSuffixList.getDomain(domain);
    };

    /***************************************************************************/

    var handleListedSitesPage = function () {
        $('#listed_sites_page .header .back-btn').off("click");
        $('#listed_sites_page .header .back-btn').on("click", function (ev) {
            openPage(PAGES.cookie_control);
        });

        handleListedSitesPageFloatingBtn();
    };

    var setListedSitesPageHeader = function (title) {
        $('#listed_sites_page .header .header-title').text(title || '');
    };

    /**
     * Set an attribute with a type of page.
     * Depends on this attribute items color will be grren of red.
     * This attribute also affects the actions of the floating button.
     * @param {string<whitelist>|string<blacklist>} type
     */
    var setListedSitesPageType = function (type) {
        $('#listed_sites_page').attr('data-page-type', type || 'whitelisted');
    };

    /**
     * Check is opened a Whitelisted sites page or Blacklisted
     * @returns {boolean}
     */
    var isWhitelistedSitesPageType = function () {
        return $('#listed_sites_page').attr('data-page-type') === 'whitelist';
    };

    /**
     * Check is opened a "Sites with cookies set" page
     * @returns {boolean}
     */
    var isAllSitesPageType = function () {
        return $('#listed_sites_page').attr('data-page-type') === 'all';
    };


    var renderListedSitesPage = function (type) {
        let headerTitle = type === 'whitelist' ? 'popupCookieControlWhitelistedSitesTitle'
            : (type === 'all' ? 'popupCookieControlSitesTitle' : 'popupCookieControlBlacklistedSitesTitle');

        setListedSitesPageHeader(vAPI.i18n(headerTitle));
        setListedSitesPageType(type);

        fillSitesList(geListedSites(type), type);

        handleListedSitesControls(type);
    };

    var handleListedSitesControls = function () {
        handleListedSitesPageControls();
        handleAllSitesWithCookiesPage();

        // Set "Clear all cookies"/"Remove all from whitelist/blacklist" floating button tooltip
        var tipClearAll = isAllSitesPageType() ? vAPI.i18n('popupTipClearAllCookies') : vAPI.i18n('popupTipRemoveAll');
        $('#listed_sites_page .fixed-action-btn .btn-floating').attr('data-tooltip', tipClearAll);
        $('#listed_sites_page .fixed-action-btn .btn-floating').each(function (index, elem) {
            M.Tooltip.init(elem, {enterDelay: 300});
        });
    };

    /**
     * Handle "Whitelisted"/"Blacklisted" sites pages controls:
     * Set tooltips
     * Handle "remove domain from list" buttons
     */
    var handleListedSitesPageControls = function () {
        var divSitesList = $('#listed_sites_page .sites-list');

        // Set and handle "Remove" button tooltip
        var tipRemove = vAPI.i18n('popupTipRemove');
        divSitesList.find('.listed-site__remove_btn').attr('data-tooltip', tipRemove);
        divSitesList.find('.listed-site__remove_btn').each(function (index, elem) {
            let instance = M.Tooltip.init(elem, {enterDelay: 300});
            // We need to save the tooltip instance for destroying it after current site will be remove.
            // When tooltip is visible (on hover) and current DOM element removed - tooltip don't hide automatically.
            $(elem).data('tip-instance', instance);
        });


        // Set "Remove" button click listener
        divSitesList.find('.listed-site__remove_btn').off('click');
        divSitesList.find('.listed-site__remove_btn').on('click', function (ev) {
            let listedSite = ev.currentTarget.closest('.listed-site');
            let domain = listedSite.getAttribute('data-domain');
            if (isWhitelistedSitesPageType()) {
                removeDomainFromWhitelist(domain);
            }
            else if (!isAllSitesPageType()) { // if blacklisted sites page opened
                removeDomainFromBlacklist(domain);
            }

            // Remove tooltip from DOM
            let tipInstance = $(ev.currentTarget).data('tip-instance');
            if (tipInstance) tipInstance.destroy();
            listedSite.parentNode.removeChild(listedSite);
        });
    };

    /**
     * Set localization texts and tooltips, handle controls on "Sites with cookies set" page:
     * Clear domain cookies
     * Popup menu
     * Whitelist/Blacklist site
     */
    var handleAllSitesWithCookiesPage = function () {
        var divSitesList = $('#listed_sites_page .sites-list');

        // Set and handle "Clear domain cookies" button tooltip
        var tipClear = vAPI.i18n('popupTipClearCookies');
        divSitesList.find('.listed-site__clear_btn').attr('data-tooltip', tipClear);
        divSitesList.find('.listed-site__clear_btn').each(function (index, elem) {
            M.Tooltip.init(elem, {enterDelay: 300});
        });

        // Set "Clear domain cookies" button click listener
        divSitesList.find('.listed-site__clear_btn').off('click');
        divSitesList.find('.listed-site__clear_btn').on('click', function (ev) {
            let listedSite = ev.currentTarget.closest('.listed-site');
            let domain = listedSite.getAttribute('data-domain');

            clearDomainCookies(domain);
        });

        // Handle "menu" button
        divSitesList.find('.listed-site__more_btn').off('click');
        divSitesList.find('.listed-site__more_btn').on('click', function (ev) {
            let listedSite = ev.currentTarget.closest('.listed-site');
            closeListedSitePopupMenu();
            listedSite.querySelector('.listed-site__menu').classList.add('active');
        });

        // Set list item popup menu texts
        divSitesList.find('.listed-site__menu [data-i18n]').each(function(index, elem) {
            $(elem).html(vAPI.i18n.prepareTemplateText(vAPI.i18n($(elem).attr('data-i18n'))));
        });

        // Handle menu popup "close" buttons
        divSitesList.find('.listed-site__menu .listed-site__menu__header__close_btn').off('click');
        divSitesList.find('.listed-site__menu .listed-site__menu__header__close_btn').on('click', function (ev) {
            closeListedSitePopupMenu();
        });

        // Close menu popup if user clicks outside popup
        $('body').off('click');
        $('body').on('click', function (ev) {
            if (ev.target.classList.contains('listed-site__menu') || ev.target.closest('.listed-site__menu')
                || ev.target.classList.contains('listed-site__more_btn') || ev.target.closest('.listed-site__more_btn'))
            {
                return;
            }

            closeListedSitePopupMenu();
        });

        // Blacklist/Whitelist buttons in a popup (vertical dots button)
        divSitesList.find('.listed-site__menu_item').off('click');
        divSitesList.find('.listed-site__menu_item').on('click', function (ev) {
            let action = ev.currentTarget.getAttribute('data-action');
            let domain = ev.currentTarget.getAttribute('data-domain');
            let divListedSite = ev.currentTarget.closest('.listed-site');
            let state = false;

            switch (action) {
                case 'whitelisted':
                    state = !isCookieDomainWhitelisted(domain);
                    setDomainWhitelistState(domain, state);
                    break;
                case 'blacklisted':
                    state = !isCookieDomainBlacklisted(domain);
                    setDomainBlacklistState(domain, state);
                    break;
            }

            // Set attribute to a domain title element to highlight a row (green or red)
            toggleListedSiteElAttribute(divListedSite, action, state);
            closeListedSitePopupMenu();
        });

        // After user clicks on domain element - open domain details page (list of cookies)
        divSitesList.find('.listed-site__domain').off('click');
        divSitesList.find('.listed-site__domain').on('click', function (ev) {
            if (ev.currentTarget.closest('#listed_sites_page').getAttribute('data-page-type') === 'all') {
                let domain = ev.currentTarget.closest('.listed-site').getAttribute('data-domain');
                openDomainCookiesPage(domain);
            }
        });
    };

    /**
     * Toggle whitelisted/blacklisted attribute for site item (row in list) element
     *      for highlighting by green/red color.
     * @param {DOMElement} elem
     * @param {string} setAttr - whitelisted | blacklisted
     * @param {boolean} state
     */
    var toggleListedSiteElAttribute = function (elem, setAttr, state) {
        elem.removeAttribute('whitelisted');
        elem.removeAttribute('blacklisted');
        if (state)
            elem.setAttribute(setAttr, state);
    };

    // Close all opened popup menus on a "Sites with cookies set" page.
    var closeListedSitePopupMenu = function () {
        $('.listed-site__menu').removeClass('active');
    };

    /**
     * Returns the list of all sites listed in a whitelist/blacklist with a quantity of cookies set for these sites.
     * @param {string<whitelist>|string<blacklist>|string<all>} type
     * @returns {Map<string, number>} - {domain: cookies quantity}
     */
    var geListedSites = function (type) {
        var response = new Map();

        var domains = [];

        if (type === 'all') {
            domains = Array.from(allCookies.keys());
        }
        else if (!popupData.cookiesSettings[type]) // No whitelisted/blacklisted sites
            return response;
        else
            domains = popupData.cookiesSettings[type].domains;

        domains.forEach(function (domain) {
            if (allCookies.has(domain)) {
                response.set(domain, allCookies.get(domain).length);
            }
            else {
                response.set(domain, 0);
            }
        });

        return response;
    };

    var fillSitesList = function (sitesList, type) {
        var divSitesList = $('#listed_sites_page .sites-list');
        divSitesList.html('');

        var template = "";

        if (type === 'all') {
            template = $('#all_sites_item_template').html();
        }
        else {
            template = $('#listed_site_template').html();
        }

        sitesList.forEach(function (quantity, domain) {
            let data = {domain: domain, quantity: quantity};
            if (type === 'all') {
                data.whitelisted = isCookieDomainWhitelisted(domain);
                data.blacklisted = isCookieDomainBlacklisted(domain);
            }
            divSitesList.append(createSitesListRow(data, template));
        });
    };

    /**
     * Create an element row for whitelisted/blacklisted/all sites page
     * @param {Object} data -
     *                                  domain - site domain
     *                                  quantity - number of cookies set for this domain
     * @param {string} template - element template for using with Mustache
     * @returns {*|jQuery|HTMLElement}
     */
    var createSitesListRow = function (data, template) {
        return $(Mustache.render(template, data));
    };

    /**
     * Remove domain cookie.
     * Current method used when user removes cookie from a domain opened in a "Sites with cookies set" page
     * Remove cookie from allCookies list.
     * @param {Cookie} cookieData
     * @param {string} domain - parsed root domain, need for receiving cookie from allCookies list
     */
    var rmCookieFromAllSitesPage = function (cookie) {
        let domain = getRootDomain(cookie.domain);
        let domainCookies = allCookies.get(domain);

        let cookieIndex = domainCookies.findIndex(function (cookieItem) {
            return cookieItem.name === cookie.name && cookieItem.domain === cookie.domain;
        });

        if (cookieIndex !== -1) {
            domainCookies.splice(cookieIndex, 1);
            allCookies.set(domain, domainCookies);
        }

        // Set cookies quantity in a domain row on a "Sites with cookies set" page
        $('#listed_sites_page .listed-site[data-domain="' + domain + '"] .listed-site__quantity span')
            .html(allCookies.get(domain).length || 0);
    };


    var removeDomainFromWhitelist = function (domain) {
        rmDomainFromWhitelist(domain);

        messager.send('popupPanel', {
            what:  'toggleCookiesDomainWhitelist',
            domain:   domain,
            state: false
        });
    };

    var removeDomainFromBlacklist = function (domain) {
        rmDomainFromBlacklist(domain);

        messager.send('popupPanel', {
            what:  'toggleCookiesDomainBlacklist',
            domain:   domain,
            state: false
        });
    };

    /***************************************************************************/

    /**
     * Remove all unprotected cookies of set domain.
     * Current method used when user clear domain cookies on "all sites with cookies set" page
     *      and when user clear all cookies (floating action button) on "domain cookies" (Cookies set on) page.
     * Whitelisted/blacklisted cookies not removed.
     * @param {string} domain
     * @param {boolean} watchDomainProtection - if set - we'll see if domain is whitelisted and don't remove such cookies
     */
    var clearDomainCookies = function (domain, watchDomainProtection) {
        let domainCookies = allCookies.get(domain);

        for (var i = 0; i < domainCookies.length; i) {
            var cookie = domainCookies[i];
            if (!isCookieWhitelisted(cookie) && !isCookieBlacklisted(cookie)) {
                if (!watchDomainProtection || isCookieDomainWhitelisted(getRootDomain(cookie.domain))) {
                    messager.send(
                        'popupPanel',
                        {
                            what: 'removeCookie',
                            cookie: cookie
                        }
                    );

                    rmCookieFromAllSitesPage(cookie);
                    rmCookieFromDomainCookiesList(cookie);
                }
                else {
                    i++;
                }
            }
            else {
                i++;
            }
        }
    };

    /***************************************************************************/

    /**
     * Floating button has two states: 1) Whitelisted/Blacklisted sites pages 2) All sites page
     * Current states has two different icons and tooltips
     */
    var handleListedSitesPageFloatingBtn = function () {
        $('#listed_sites_page .fixed-action-btn .btn-floating').off('click');
        $('#listed_sites_page .fixed-action-btn .btn-floating').on('click', function (ev) {
            if (isWhitelistedSitesPageType())
                clearWhitelist();
            else if (!isAllSitesPageType()) // if blacklisted sites page opened
                clearBlacklist();
            else if (isAllSitesPageType()) {
                clearAllCookies();
            }
        });
    };

    var clearWhitelist = function () {
        messager.send('popupPanel', { what:  'clearCookiesDomainsWhitelist' });
        document.querySelector('#listed_sites_page .sites-list').innerHTML = "";
        popupData.cookiesSettings.whitelist.domains = [];
    };

    var clearBlacklist = function () {
        messager.send('popupPanel', { what:  'clearCookiesDomainsBlacklist' });
        document.querySelector('#listed_sites_page .sites-list').innerHTML = "";
        popupData.cookiesSettings.blacklist.domains = [];
    };

    var clearAllCookies = function () {
        messager.send('popupPanel', { what:  'clearAllCookies' });
        getPopupData();
    };

    /************************** Domain cookies page ********************************/

    var handleDomainCookiesPage = function () {
        $('#domain_cookies_page .header .back-btn').off("click");
        $('#domain_cookies_page .header .back-btn').on("click", function (ev) {
            openPage(PAGES.all_sites);
            _domainCookies = [];
        });

        handleDomainCookiesPageFloatingBtn();
    };

    var handleDomainCookiesPageFloatingBtn = function () {
        $('#domain_cookies_page .fixed-action-btn .btn-floating').off("click");
        $('#domain_cookies_page .fixed-action-btn .btn-floating').on("click", function (ev) {
            let domain = document.querySelector('#domain_cookies_page').getAttribute('data-domain');
            clearDomainCookies(domain);
        });
    };

    /**
     * Remove cookie from "Cookies set on" page.
     * Remove cookie object from _domainCookies list, remove cookie element from DOM.
     * @param {Cookie} cookie
     */
    var rmCookieFromDomainCookiesList = function (cookie) {
        for (var i = 0; i < _domainCookies.length; i++) {
            let cookieItem = _domainCookies[i];
            if (cookieItem.cookieData.name === cookie.name && cookieItem.cookieData.domain === cookie.domain) {
                cookieItem.remove();
                _domainCookies.splice(i, 1);
                break;
            }
        }

        // Set cookies quantity of a domain opened in a "Cookies set on" page
        document.querySelector('#domain_cookies_page .listed-site__quantity span').innerHTML = _domainCookies.length;
    };


    var openDomainCookiesPage = function (domain) {
        openPage(PAGES.domain_cookies);
        fillDomainCookiesPage(domain);
    };

    /**
     * List of cookies of a domain opened in a "Cookies set on" page
     * @type {CookieItem[]}
     * @private
     */
    var _domainCookies = [];

    var fillDomainCookiesPage = function (domain) {
        var domainCookies = allCookies.get(domain);
        document.querySelector('#domain_cookies_page').setAttribute("data-domain", domain);
        document.querySelector('#domain_cookies_page .listed-site__domain').innerHTML = domain;
        document.querySelector('#domain_cookies_page .listed-site__quantity span').innerHTML = domainCookies.length;

        if (!domainCookies)
            return;

        var divCookieList = $('#domain_cookies_page .domain-cookies-list');
        divCookieList.html("");


        domainCookies.forEach(function (cookieData) {
            cookieData.whitelisted = isCookieWhitelisted(cookieData);
            cookieData.blacklisted = isCookieBlacklisted(cookieData);
        });
        domainCookies = sortCookiesList(domainCookies);

        _domainCookies = [];

        domainCookies.forEach(function (cookieData) {
            let cookieItem = new CookieItem(cookieData, CookieItem.type.DOMAIN);
            cookieItem.appendTo(divCookieList);
            _domainCookies.push(cookieItem);
        });
    };

    var isCookieWhitelisted = function (cookie) {
        var index = popupData.cookiesSettings.whitelist.cookies.findIndex(function (cookieItem) {
            return cookieItem.name === cookie.name && cookieItem.domain === cookie.domain;
        });
        return index !== -1;
    };

    var isCookieBlacklisted = function (cookie) {
        var index = popupData.cookiesSettings.blacklist.cookies.findIndex(function (cookieItem) {
            return cookieItem.name === cookie.name && cookieItem.domain === cookie.domain;
        });
        return index !== -1;
    };


    /***************************************************************************/

    var getActivePage = function () {
        return document.querySelector('#pages_wrapper .page.active');
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
        if (!isSafari) {
            parseAllCookiesBySites();
        }


        // ProtectionLists
        renderTrackedUrls();
        displayUsedFilters(isInitial);
        updateFiltersTitleTooltips();

        var activePage = getActivePage();
        if (activePage.id === PAGES.all_sites && activePage.getAttribute('data-page-type') === 'all') {
            renderListedSitesPage('all');
        }
        else if (activePage.id === PAGES.domain_cookies) {
            renderListedSitesPage('all');
            openDomainCookiesPage(activePage.getAttribute('data-domain'));
        }


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

        $(".user-filters-page-content").mCustomScrollbar({
            // scrollInertia: 0,
            autoHideScrollbar: false,
            scrollButtons:{ enable: false },
            advanced:{ updateOnContentResize: true },
            mouseWheel:{
                scrollAmount: 150
            }
        });

        $(".listed-sites-page-content").mCustomScrollbar({
            // scrollInertia: 0,
            autoHideScrollbar: false,
            scrollButtons:{ enable: false },
            advanced:{ updateOnContentResize: true },
            mouseWheel:{
                scrollAmount: 150
            }
        });
    };


    /******************************************************************************/

    var renderPopupLazy = function() {
        if (isSafari) {
            messager.send(
                'popupPanel',
                { what: 'getPopupLazyData', tabId: popupData.tabId },
                renderUserFiltersCosmetic
            );
        }
        else {
            messager.send(
                'popupPanel',
                { what: 'getPopupLazyData', tabId: popupData.tabId }
            );
        }
    };

    var onPopupMessage = function(data) {
        if ( !data ) { return; }
        if ( data.tabId !== popupData.tabId ) { return; }

        switch ( data.what ) {
            case 'cosmeticallyFilteredElementCountChanged':
                renderUserFiltersCosmetic(data.userFiltersCosmeticRules);
                break;
        }
    };

    messager.addChannelListener('popup', onPopupMessage);

    /***************************************************************************/

    var getTabId = function () {
        // If there's no tab id specified in the query string,
        // it will default to current tab.
        var tabId = null;

        // Extract the tab id of the page this popup is for
        var matches = window.location.search.match(/[\?&]tabId=([^&]+)/);
        if ( matches && matches.length === 2 ) {
            tabId = matches[1];
        }

        return tabId;
    };

    var getPopupData = function (tabId, isInitial) {
        var onDataReceived = function (response) {
            cachePopupData(response);
            renderPopup(isInitial);
            renderPopupLazy(); // UserFilters cosmetics rules receiving
            pollForContentChange();
        };
        messager.send('popupPanel',
            { what: 'getPopupData', tabId: tabId },
            onDataReceived
        );
    };

    var stopEvent = function(ev) {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        ev.preventDefault();
    };


    uDom.onLoad(function () {
        initializeMaterialControls();

        filterItemTmplt = $("#filter_template").text();


        getPopupData(getTabId(), true);

        handleControls();

        $("#search_input").focus();
    });

})();
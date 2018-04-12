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

        initializeTooltips();
    };

    var initializeTooltips = function () {
        // Whitelist buttons (shield icon and floating button in Protection tab)
        M.Tooltip.init($("#protection_status_btn")[0], {enterDelay: 300});
        M.Tooltip.init($("#pause_site_btn")[0], {enterDelay: 300});

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

            if (!popupData.trackedUrls[filterPath])
                popupData.trackedUrls[filterPath] = [];

            popupData.trackedUrls[filterPath].push(key);
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

        // ProtectionLists
        renderTrackedUrls();
        displayUsedFilters(isInitial);
        updateFiltersTitleTooltips();

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
/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-2016 Raymond Hill

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

/* global uDom */

/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

var userListName = "Your own filter";//vAPI.i18n('1pPageName');
var listDetails = {};
var cosmeticSwitch = true;
var externalLists = '';
var cacheWasPurged = false;
var needUpdate = false;
var hasCachedContent = false;

/******************************************************************************/

var onMessage = function(msg) {
    switch ( msg.what ) {
    case 'allFilterListsReloaded':
        renderFilterLists();
        break;

    case 'forceUpdateAssetsProgress':
        renderBusyOverlay(true, msg.progress);
        if ( msg.done ) {
            messaging.send('dashboard', { what: 'reloadAllFilters' });
        }
        break;

    default:
        break;
    }
};

var messaging = vAPI.messaging;
messaging.addChannelListener('dashboard', onMessage);

/******************************************************************************/

var renderNumber = function(value) {
    return value.toLocaleString();
};

/******************************************************************************/

// TODO: get rid of background page dependencies

var renderFilterLists = function() {
    var listGroupTemplate = uDom('#templates .groupEntry');
    var listEntryTemplate = uDom('#templates .listEntry');
    var listStatsTemplate = vAPI.i18n('3pListsOfBlockedHostsPerListStats');
    var renderElapsedTimeToString = vAPI.i18n.renderElapsedTimeToString;
    var lastUpdateString = vAPI.i18n('3pLastUpdate');

    // Assemble a pretty blacklist name if possible
    var listNameFromListKey = function(listKey) {
        if ( listKey === listDetails.userFiltersPath ) {
            return userListName;
        }
        var list = listDetails.current[listKey] || listDetails.available[listKey];
        var listTitle = list ? list.title : '';
        if ( listTitle === '' ) {
            return listKey;
        }
        return listTitle;
    };
//
    var liFromListEntry = function(listKey) {
        var entry = listDetails.available[listKey];
        var li = listEntryTemplate.clone();

        if ( entry.off !== true ) {
            li.descendants('div[type="checkbox"]').addClass('checked');
            //li.descendants('input').attr('checked', '');
        }

        var elem = li.descendants('a:nth-of-type(1)');
        elem.attr('href', 'asset-viewer.html?url=' + encodeURI(listKey));
        elem.attr('type', 'text/html');
        elem.attr('data-listkey', listKey);
        elem.text(listNameFromListKey(listKey) + '\u200E');

        if ( entry.instructionURL ) {
            elem = li.descendants('a:nth-of-type(2)');
            elem.attr('href', entry.instructionURL);
            elem.css('display', '');
        }

        if ( entry.supportName ) {
            elem = li.descendants('a:nth-of-type(3)');
            elem.attr('href', entry.supportURL);
            elem.text('(' + entry.supportName + ')');
            elem.css('display', '');
        }

        elem = li.descendants('span:nth-of-type(1)');
        var text = listStatsTemplate
            .replace('{{used}}', renderNumber(!entry.off && !isNaN(+entry.entryUsedCount) ? entry.entryUsedCount : 0))
            .replace('{{total}}', !isNaN(+entry.entryCount) ? renderNumber(entry.entryCount) : '?');
        elem.text(text);

        // https://github.com/gorhill/uBlock/issues/78
        // Badge for non-secure connection
        var remoteURL = listKey;
        if ( remoteURL.lastIndexOf('http:', 0) !== 0 ) {
            remoteURL = entry.homeURL || '';
        }
        if ( remoteURL.lastIndexOf('http:', 0) === 0 ) {
            li.descendants('span.status.unsecure').css('display', '');
        }

        // https://github.com/chrisaljoudi/uBlock/issues/104
        var asset = listDetails.cache[listKey] || {};

        // Badge for update status
        if ( entry.off !== true ) {
            if ( asset.repoObsolete ) {
                li.descendants('span.status.new').css('display', '');
                needUpdate = true;
            } else if ( asset.cacheObsolete ) {
                li.descendants('span.status.obsolete').css('display', '');
                needUpdate = true;
            } else if ( entry.external && !asset.cached ) {
                li.descendants('span.status.obsolete').css('display', '');
                needUpdate = true;
            }
        }

        // In cache
        if ( asset.cached ) {
            elem = li.descendants('span.status.purge');
            elem.css('display', '');
            elem.attr('title', lastUpdateString.replace('{{ago}}', renderElapsedTimeToString(asset.lastModified)));
            hasCachedContent = true;
        }
        return li;
    };

    var listEntryCountFromGroup = function(listKeys) {
        if ( Array.isArray(listKeys) === false ) {
            return '';
        }
        var count = 0;
        var i = listKeys.length;
        while ( i-- ) {
            if ( listDetails.available[listKeys[i]].off !== true ) {
                count += 1;
            }
        }
        return count === 0 ? '' : '(' + count.toLocaleString() + ')';
    };

    var liFromListGroup = function(groupKey, listKeys) {
        var liGroup = listGroupTemplate.clone();
        var groupName = vAPI.i18n('3pGroup' + groupKey.charAt(0).toUpperCase() + groupKey.slice(1));
        if ( groupName !== '' ) {
            liGroup.descendants('span.geName').text(groupName);
            liGroup.descendants('span.geCount').text(listEntryCountFromGroup(listKeys));
        }
        var ulGroup = liGroup.descendants('ul');
        if ( !listKeys ) {
            return liGroup;
        }
        listKeys.sort(function(a, b) {
            return (listDetails.available[a].title || '').localeCompare(listDetails.available[b].title || '');
        });
        for ( var i = 0; i < listKeys.length; i++ ) {
            ulGroup.append(liFromListEntry(listKeys[i]));
        }
        return liGroup;
    };

    // https://www.youtube.com/watch?v=unCVi4hYRlY#t=30m18s

    var groupsFromLists = function(lists) {
        var groups = {};
        var listKeys = Object.keys(lists);
        var i = listKeys.length;
        var listKey, list, groupKey;
        while ( i-- ) {
            listKey = listKeys[i];
            list = lists[listKey];
            groupKey = list.group || 'nogroup';
            if ( groups[groupKey] === undefined ) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(listKey);
        }
        return groups;
    };

    var onListsReceived = function(details) {
        // Before all, set context vars
        listDetails = details;
        cosmeticSwitch = details.cosmetic;
        //needUpdate = false;
        needUpdate = true; //16.06 - Igor. Always enable Update button
        hasCachedContent = false;

        // Visually split the filter lists in purpose-based groups
        //var ulLists = uDom('#lists').empty(), liGroup;
        //var groups = groupsFromLists(details.available);
        //var groupKey, i;
        //var groupKeys = [
        //    'default',
        //    'ads',
        //    'privacy',
        //    'malware',
        //    'social',
        //    'multipurpose',
        //    'regions',
        //    'custom'
        //];
        fillFiltersList(getSelectedFilters(listDetails));
        fillAvailableFiltersList();
        // * 16.06 - Igor
        //for ( i = 0; i < groupKeys.length; i++ ) {
        //    groupKey = groupKeys[i];
        //    liGroup = liFromListGroup(groupKey, groups[groupKey]);
        //    liGroup.toggleClass(
        //        'collapsed',
        //        vAPI.localStorage.getItem('collapseGroup' + (i + 1)) === 'y'
        //    );
        //    ulLists.append(liGroup);
        //    delete groups[groupKey];
        //}
        //// For all groups not covered above (if any left)
        //groupKeys = Object.keys(groups);
        //for ( i = 0; i < groupKeys.length; i++ ) {
        //    groupKey = groupKeys[i];
        //    ulLists.append(liFromListGroup(groupKey, groups[groupKey]));
        //}

        uDom('#listsOfBlockedHostsPrompt').text(
            vAPI.i18n('3pListsOfBlockedHostsPrompt')
                .replace('{{netFilterCount}}', renderNumber(details.netFilterCount))
                .replace('{{cosmeticFilterCount}}', renderNumber(details.cosmeticFilterCount))
        );

        toggleCheckbox(('#autoUpdate'), listDetails.autoUpdate === true);
        toggleCheckbox(('#parseCosmeticFilters'), listDetails.cosmetic === true);

        renderWidgets();
        renderBusyOverlay(details.manualUpdate, details.manualUpdateProgress);
    };
    
    //Custom methods
    /**************************************************************************/
    var fillFiltersList = function (filtersList) {
        var filtersContainer = $("#filterLists");
        filtersContainer.html("");
        var fragment = document.createDocumentFragment();
        for (var path in filtersList) {
            try {
                var data = filtersList[path];
                data.path = path;
                var filter = createFilterItem(data);
                filter._data = data;
                fragment.appendChild(filter);

                checkIsCached(data);
            }
            catch (exception) {
                console.error("Exception in 'fillFiltersList' (3p-filters.js) :\n\t", exception);
            }
        }
        filtersContainer.html(fragment);
        // Remove а possibility of default filters opening.
        $(filtersContainer).find('.subscription .subscriptionTitle[ href="#"]').on('click', function (e) {
            e.preventDefault();
        });
        $('.subscriptionRemoveButton ').on('click', rmSubscriptionBtnClick);
        $('.default-enabling-control').on('click', defaultOffBtnClick);
        $('.subscriptionInUse').on('click', inUseCheckboxChange);
    };

    var fillAvailableFiltersList = function () {
        var selectorContainer = $("#subscriptionSelector");
        selectorContainer.change(updateSubscriptionSelection);

        selectorContainer.html("");
        var fragment = document.createDocumentFragment();

        var groups = groupsFromLists(listDetails.available);

        for (var group in groups) {
            var groupTitle = createTitleOption(group);
            var filterOptions = createFilterOptions(groups[group]);

            fragment.appendChild(groupTitle);
            fragment.appendChild(filterOptions);
        }
        fragment.appendChild(createCustomFilterOption());
        selectorContainer.html(fragment);
    };


    var createTitleOption = function (text) {
        var option = new Option(text.toUpperCase());
        option.disabled = true;
        return option;
    };
    var createCustomFilterOption = function () {
        var option = new Option("Add a different filter...");
        option._data = null;
        return option;
    };

    var updateSubscriptionSelection = function () {
        var list = document.querySelector("#subscriptionSelector");
        var data = list.options[list.selectedIndex]._data;
        if (data)
            $("#customSubscriptionContainer").hide();
        else {
            $("#customSubscriptionContainer").show();
            $("#customSubscriptionTitle").focus();
        }
    };

    var createFilterOptions = function (filtersNames) {
        var fragment = document.createDocumentFragment();

        var filter = null;
        for (var i = 0; i < filtersNames.length; i++) {
            filter = listDetails.available[filtersNames[i]];
            filter.path = filtersNames[i];
            var option = new Option(listNameFromListKey(filtersNames[i]));
            option._data = filter;


            if (!filter.off || (listDetails.current[filtersNames[i]] && !listDetails.current[filtersNames[i]].off))
                option.classList.add("selected");

            fragment.appendChild(option);
        }
        return fragment;
    };


    var rmSubscriptionBtnClick = function (ev) {
        var data = getFilterData(ev.currentTarget);
        updateSubscriptions(data.path || "", !data.off, data.inUse, data.defaultOff);
    };

    var defaultOffBtnClick = function (ev) {
        try {
            var data = getFilterData(ev.currentTarget);
            if (data.defaultOff) {
                ev.currentTarget.classList.remove("disabled");
            }
            else {
                ev.currentTarget.classList.add("disabled");
            }

            updateSubscriptions(data.path || "", data.off, data.inUse, !data.defaultOff);
        }
        catch (exception) {
            console.error("Exception in 'defaultOffBtnClick' (3p-filters.js) :\n\t", exception);
        }
    };

    var inUseCheckboxChange = function (ev) {
        try {
            var data = getFilterData(ev.currentTarget);
            updateSubscriptions(data.path || "", data.off, !data.inUse, data.defaultOff);
        }
        catch (exception) {
            console.error("Exception in 'inUseCheckboxChange' (3p-filters.js) :\n\t", exception);
        }
    };

     var getFilterData = function (clickedElement) {
        try {
            return $(clickedElement).closest(".subscription")[0]._data;
        }
        catch (exception) {
            console.error("Exception in 'getFilterData' (3p-filters.js) :\n\t", exception);
        }
    };


    var getSelectedFilters = function (listDetails) {
        var selectedFilters = {};
        for (var path in listDetails.current) {
            try {
                var current = listDetails.current[path];
                var available = listDetails.available[path];
                if ((typeof current.off == "boolean" && !current.off)
                        || (typeof available.off == "boolean" && !available.off))
                {


                    selectedFilters[path] = current;
                    if (!selectedFilters[path].title)
                        selectedFilters[path].title = listNameFromListKey(path);
                    if (listDetails.cache[path] && listDetails.cache[path].lastModified)
                        selectedFilters[path].lastModified = listDetails.cache[path].lastModified;
                    else
                        selectedFilters[path].lastModified = current.lastUpdate;
                }
            }
            catch (exception) {
                console.error("Exception in 'getSelectedFilters' (3p-filters.js) :\n\t", exception);
            }
        }
        return selectedFilters;
    };

    var createFilterItem = function (data) {
        var asset = listDetails.cache[data.path] || {};
        try {
            var template = $("#filter_template").html();
            template = template.replace(new RegExp('{{delete_possibility}}', 'g'), (data.path === listDetails.userFiltersPath ? "disabled" : ""));
            template = template.replace(new RegExp('{{path}}', 'g'), data.path);
            template = template.replace(new RegExp('{{inuse_checked}}', 'g'), (data.inUse ? "checked" : ""));
            template = template.replace(new RegExp('{{default_disabled}}', 'g'), data.defaultOff ? "disabled" : "");
            template = template.replace(new RegExp("{{title}}", 'g'), data.title || "");
            template = template.replace(new RegExp("{{url}}", 'g'), data.homeURL || data.path || "#");
            template = template.replace(new RegExp("{{group}}", 'g'), data.group || "");
            if (data.error) {
                template = template.replace(new RegExp("{{last_update}}", 'g'), data.error);
                template = template.replace(new RegExp("{{error}}", 'g'), "error");
            }
            else {
                var date = new Date(asset.lastModified);

                var dateString = !(date instanceof Date && isFinite(date)) ? "-" :
                    (date.getFullYear() + "-" +
                    ("0" + (date.getMonth() + 1)).slice(-2) + "-" +
                    ("0" + date.getDate()).slice(-2) + "  " +
                    ("0" + date.getHours()).slice(-2) + ":" +
                    ("0" + date.getMinutes()).slice(-2));
                template = template.replace(new RegExp("{{last_update}}", 'g'), dateString);
                template = template.replace(new RegExp("{{error}}", 'g'), "");
            }
            return $(template)[0];
        }
        catch (exception) {
            console.error("Exception in 'createFilterItem' (3p-filters.js) :\n\t", exception);
            return null;
        }
    };

    var checkIsCached = function (filterData) {
        var asset = listDetails.cache[filterData.path] || {};
        if (asset && asset.cached) {
            hasCachedContent = true;
        }
    };
    
    /**************************************************************************/

    messaging.send('dashboard', { what: 'getLists' }, onListsReceived);
};

/******************************************************************************/

// Progress must be normalized to [0, 1], or can be undefined.

var renderBusyOverlay = function(state, progress) {
    progress = progress || {};
    var showProgress = typeof progress.value === 'number';
    if ( showProgress ) {
        uDom('#busyOverlay > div:nth-of-type(2) > div:first-child').css(
            'width',
            (progress.value * 100).toFixed(1) + '%'
        );
        var text = progress.text || '';
        if ( text !== '' ) {
            uDom('#busyOverlay > div:nth-of-type(2) > div:last-child').text(text);
        }
    }
    uDom('#busyOverlay > div:nth-of-type(2)').css('display', showProgress ? '' : 'none');
    uDom('body').toggleClass('busy', !!state);
};

/******************************************************************************/

// This is to give a visual hint that the selection of blacklists has changed.

var renderWidgets = function() {
    //uDom('#buttonApply').toggleClass('disabled', !listsSelectionChanged());
    uDom('#buttonUpdate').toggleClass('disabled', !listsContentChanged());
    uDom('#buttonPurgeAll').toggleClass('disabled', !hasCachedContent);
};

/******************************************************************************/

// Return whether selection of lists changed.

var listsSelectionChanged = function() {   
    if ( listDetails.cosmetic !== cosmeticSwitch ) {
        return true;
    }

    if ( cacheWasPurged ) {
        return true;
    }

    var availableLists = listDetails.available;
    var currentLists = listDetails.current;
    var location, availableOff, currentOff;
    
    // This check existing entries
    for ( location in availableLists ) {
        if ( availableLists.hasOwnProperty(location) === false ) {
            continue;
        }
        availableOff = availableLists[location].off === true;
        currentOff = currentLists[location] === undefined || currentLists[location].off === true;
        if ( availableOff !== currentOff ) {
            return true;
        }
    }

    // This check removed entries
    for ( location in currentLists ) {
        if ( currentLists.hasOwnProperty(location) === false ) {
            continue;
        }
        currentOff = currentLists[location].off === true;
        availableOff = availableLists[location] === undefined || availableLists[location].off === true;
        if ( availableOff !== currentOff ) {
            return true;
        }
    }

    return false;
};

/******************************************************************************/

// Return whether content need update.

var listsContentChanged = function() {
    return needUpdate;
};

/******************************************************************************/

var onListCheckboxChanged = function() {
    var href = uDom(this).parent().descendants('a').first().attr('data-listkey');
    if ( typeof href !== 'string' ) {
        return;
    }
    if ( listDetails.available[href] === undefined ) {
        return;
    }
    listDetails.available[href].off = !this.checked;
    renderWidgets();
};

/******************************************************************************/

var onPurgeClicked = function() {
    var button = uDom(this);
    var li = button.parent();
    var href = li.descendants('a').first().attr('data-listkey');
    if ( !href ) {
        return;
    }

    messaging.send('dashboard', { what: 'purgeCache', path: href });
    button.remove();

    // If the cached version is purged, the installed version must be assumed
    // to be obsolete.
    // https://github.com/gorhill/uBlock/issues/1733
    // An external filter list must not be marked as obsolete, they will always
    // be fetched anyways if there is no cached copy.
    var entry = listDetails.current && listDetails.current[href];
    if ( entry && entry.off !== true && /^[a-z]+:\/\//.test(href) === false ) {
        if ( typeof entry.homeURL !== 'string' || entry.homeURL === '' ) {
            li.descendants('span.status.new').css('display', '');
        } else {
            li.descendants('span.status.obsolete').css('display', '');
        }
        needUpdate = true;
    }

    if ( li.descendants('input').first().prop('checked') ) {
        cacheWasPurged = true;
        renderWidgets();
    }
};

/******************************************************************************/

var selectFilterLists = function(callback) {
    // Cosmetic filtering switch
    messaging.send(
        'dashboard',
        {
            what: 'userSettings',
            name: 'parseAllABPHideFilters',
            value: listDetails.cosmetic
        }
    );

    // Filter lists
    var switches = [];
    //var lis = uDom('#lists .listEntry'), li;
    var lis = uDom('#filterLists .listRow'), li;
    var i = lis.length;
    while ( i-- ) {
        li = lis.at(i);
        //switches.push({
        //    location: li.descendants('a').attr('data-listkey'),
        //    off: li.descendants('input').prop('checked') === false
        //});

        switches.push({
            location: li.attr('id'),
            off: li.descendants('.subscriptionInUse').hasClass('checked') === false
        });
    }

    messaging.send(
        'dashboard',
        {
            what: 'selectFilterLists',
            switches: switches
        },
        callback
    );
};

var buttonApplyHandler = function() {
      listDetails.cosmetic = isChecked(this);

    renderBusyOverlay(true);

    var onSelectionDone = function() {
        messaging.send('dashboard', { what: 'reloadAllFilters' });
    };

    selectFilterLists(onSelectionDone);

    cacheWasPurged = false;
};


var buttonUpdateHandler = function() {
    uDom('#buttonUpdate').removeClass('enabled');

    if ( needUpdate ) {
        renderBusyOverlay(true);

        var onSelectionDone = function() {
            messaging.send('dashboard', { what: 'forceUpdateAssets' });
        };

        selectFilterLists(onSelectionDone);

        cacheWasPurged = false;
    }
};

var buttonPurgeAllHandler = function() {
    uDom('#buttonPurgeAll').removeClass('enabled');

    renderBusyOverlay(true);

    var onCompleted = function() {
        //needUpdate = true;
        //cacheWasPurged = true;
        //renderWidgets();
        //renderBusyOverlay(false);

        cacheWasPurged = true;
        renderFilterLists();
    };

    messaging.send('dashboard', { what: 'purgeAllCaches' }, onCompleted);
};

/******************************************************************************/


/******************************************************************************/

var autoUpdateCheckboxChanged = function() {
    messaging.send(
        'dashboard',
        {
            what: 'userSettings',
            name: 'autoUpdate',
            value: isChecked(this)
        }
    );
};

/******************************************************************************/

var cosmeticSwitchChanged = function() {
    listDetails.cosmetic = this.checked;
    renderWidgets();
};

/******************************************************************************/

var renderExternalLists = function() {
    var onReceived = function(details) {
        uDom('#externalLists').val(details);
        externalLists = details;
    };
    messaging.send(
        'dashboard',
        { what: 'userSettings', name: 'externalLists' },
        onReceived
    );
};

/******************************************************************************/

var externalListsChangeHandler = function() {
    uDom.nodeFromId('externalListsApply').disabled =
        uDom.nodeFromId('externalLists').value.trim() === externalLists.trim();
};

/******************************************************************************/

var externalListsApplyHandler = function() {
    externalLists = uDom.nodeFromId('externalLists').value;
    messaging.send(
        'dashboard',
        {
            what: 'userSettings',
            name: 'externalLists',
            value: externalLists
        }
    );
    renderFilterLists();
    uDom('#externalListsApply').prop('disabled', true);
};

/******************************************************************************/
var groupEntryClickHandler = function() {
    var li = uDom(this).ancestors('.groupEntry');
    li.toggleClass('collapsed');
    var key = 'collapseGroup' + li.nthOfType();
    if ( li.hasClass('collapsed') ) {
        vAPI.localStorage.setItem(key, 'y');
    } else {
        vAPI.localStorage.removeItem(key);
    }
};

 function startSubscriptionSelection(title, group, url) {
        var list = document.querySelector("#subscriptionSelector");
        $("#addSubscriptionContainer").show();
        $("#addSubscriptionButton").hide();
        $("#subscriptionSelector").focus();
        if (typeof url != "undefined") {
            list.selectedIndex = list.length - 1;
            document.getElementById("customSubscriptionTitle").value = title;
            document.getElementById("customSubscriptionGroup").value = group;
            document.getElementById("customSubscriptionLocation").value = url;
        }
        updateSubscriptionSelection();
        document.getElementById("addSubscriptionContainer").scrollIntoView(true);
    }
    
    
    var updateSubscriptionSelection = function () {
        var list = document.querySelector("#subscriptionSelector");
        var data = list.options[list.selectedIndex]._data;
        if (data)
            $("#customSubscriptionContainer").hide();
        else {
            $("#customSubscriptionContainer").show();
            $("#customSubscriptionTitle").focus();
        }
    };
    
    var addSubscriptionBtnClick = function () {
        var list = document.querySelector("#subscriptionSelector");
        var data = list.options[list.selectedIndex]._data;
        var result = true;
        if (data) {
            updateSubscriptions(data.path || "", false, true, true);
        }
        else {
            result = addExternal();
        }
        if (result) {
            $("#addSubscriptionContainer").hide();
            $("#customSubscriptionContainer").hide();
            $("#addSubscriptionButton").show();
        }
    };
    /**
     * Update subscriptions after some changes like default on/off changing or in use selecting.
     * @param {string} path - path to the file, need to search filter in "availableFilters" list by key
     * @param {boolean} off - new state value
     * @param {boolean} inUse - new state value
     * @param {boolean} defaultOff - new state value
     */
    var updateSubscriptions = function (path, off, inUse, defaultOff) {
        // Reload blacklists
        renderBusyOverlay(true);
        var switches = [];
        switches.push({
            location: path,
            defaultOff: defaultOff,
            inUse: inUse,
            off: off
        });
        messaging.send('dashboard', {
            what: 'updateAndReloadAllFilters',
            switches: switches,
            update: true
        });
    };


    var addExternal = function () {
        var filterData = {
            title: $("#customSubscriptionTitle").val() || "",
            group: $("#customSubscriptionGroup").val() || "",
            location: $("#customSubscriptionLocation").val() || ""
        };

        renderBusyOverlay(true);
        messaging.send('dashboard', {
            what: 'addExternalFilter',
            filter: filterData,
            update: true
        });
        return true;
    };


/******************************************************************************/

    var handleCheckboxes = function () {
        $("div[type='checkbox']").on("mouseup", function (ev) {
            $(this).toggleClass("checked");
        });
    };

    var toggleCheckbox = function (checkbox, val) {
        if (val)
            $(checkbox).addClass("checked");
        else
            $(checkbox).removeClass("checked");
    };

    var isChecked = function (checkbox) {
        return $(checkbox).hasClass("checked");
    };

/******************************************************************************/

    var niceScroll = function () {
        $("html").niceScroll({cursorcolor:"#49854F", autohidemode: false});
    };

/******************************************************************************/

uDom.onLoad(function() {
    //*************************************************************
    uDom("#startSubscriptionSelection").on("click", startSubscriptionSelection);
    uDom('#addSubscription').on('click', addSubscriptionBtnClick);
    //*************************************************************
    uDom('#autoUpdate').on('click', autoUpdateCheckboxChanged);
    uDom('#parseCosmeticFilters').on('click', buttonApplyHandler);
    uDom('#buttonUpdate').on('click', buttonUpdateHandler);
    uDom('#buttonPurgeAll').on('click', buttonPurgeAllHandler);
    $(".refreshButton").button("option", "icons", {primary: "ui-icon-refresh"});
    $(".addButton").button("option", "icons", {primary: "ui-icon-plus"});
    $(".removeButton").button("option", "icons", {primary: "ui-icon-minus"});

    handleCheckboxes();

    renderFilterLists();
    renderExternalLists();

    niceScroll();
});

/******************************************************************************/

})();


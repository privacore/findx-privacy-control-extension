/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-2017 Raymond Hill

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

'use strict';

/******************************************************************************/

(function() {

/******************************************************************************/
//var userListName = "Your own filter";//vAPI.i18n('1pPageName');

var listDetails = {},
    filteringSettingsHash = '',
    lastUpdateTemplateString = vAPI.i18n('3pLastUpdate'),
    reValidExternalList = /[a-z-]+:\/\/\S*\/\S+/;

var hasCachedContent = false;
var needUpdate = false;

/******************************************************************************/

var onMessage = function(msg) {
    switch ( msg.what ) {
    case 'assetUpdated':
        updateAssetStatus(msg);
        break;
    case 'assetsUpdated':
        document.body.classList.remove('updating');
        renderWidgets();
        break;
    case 'staticFilteringDataChanged':
        renderFilterLists();
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

var renderFilterLists = function(soft) {
    var listGroupTemplate = uDom('#templates .groupEntry'),
        listEntryTemplate = uDom('#templates .listEntry'),
        listStatsTemplate = vAPI.i18n('3pListsOfBlockedHostsPerListStats'),
        renderElapsedTimeToString = vAPI.i18n.renderElapsedTimeToString,
        hideUnusedLists = document.body.classList.contains('hideUnused'),
        groupNames = new Map();

    // Assemble a pretty list name if possible
    var listNameFromListKey = function(listKey) {
        var list = listDetails.current[listKey] || listDetails.available[listKey];
        var listTitle = list ? list.title : '';
        if ( listTitle === '' ) { return listKey; }
        return listTitle;
    };

    var liFromListEntry = function(listKey, li) {
        var entry = listDetails.available[listKey],
            elem;
        if ( !li ) {
            li = listEntryTemplate.clone().nodeAt(0);
        }
        if ( li.getAttribute('data-listkey') !== listKey ) {
            li.setAttribute('data-listkey', listKey);
            elem = li.querySelector('input[type="checkbox"]');
            elem.checked = entry.off !== true;
            elem = li.querySelector('a:nth-of-type(1)');
            elem.setAttribute('href', 'asset-viewer.html?url=' + encodeURI(listKey));
            elem.setAttribute('type', 'text/html');
            elem.textContent = listNameFromListKey(listKey);
            li.classList.remove('toRemove');
            if ( entry.supportName ) {
                li.classList.add('support');
                elem = li.querySelector('a.support');
                elem.setAttribute('href', entry.supportURL);
                elem.setAttribute('title', entry.supportName);
            } else {
                li.classList.remove('support');
            }
            if ( entry.external ) {
                li.classList.add('external');
            } else {
                li.classList.remove('external');
            }
            if ( entry.instructionURL ) {
                li.classList.add('mustread');
                elem = li.querySelector('a.mustread');
                elem.setAttribute('href', entry.instructionURL);
            } else {
                li.classList.remove('mustread');
            }
        }

        // https://github.com/gorhill/uBlock/issues/1429
        if ( !soft ) {
            elem = li.querySelector('input[type="checkbox"]');
            elem.checked = entry.off !== true;
        }
        li.style.setProperty('display', hideUnusedLists && entry.off === true ? 'none' : '');
        elem = li.querySelector('span.counts');
        var text = '';
        if ( !isNaN(+entry.entryUsedCount) && !isNaN(+entry.entryCount) ) {
            text = listStatsTemplate
                .replace('{{used}}', renderNumber(entry.off ? 0 : entry.entryUsedCount))
                .replace('{{total}}', renderNumber(entry.entryCount));
        }
        elem.textContent = text;
        // https://github.com/chrisaljoudi/uBlock/issues/104
        var asset = listDetails.cache[listKey] || {};
        var remoteURL = asset.remoteURL;
        li.classList.toggle(
            'unsecure',
            typeof remoteURL === 'string' && remoteURL.lastIndexOf('http:', 0) === 0
        );
        li.classList.toggle('failed', asset.error !== undefined);
        li.classList.toggle('obsolete', asset.obsolete === true);
        if ( asset.cached === true ) {
            li.classList.add('cached');
            li.querySelector('.status.cache').setAttribute(
                'title',
                lastUpdateTemplateString.replace(
                    '{{ago}}',
                    renderElapsedTimeToString(asset.writeTime)
                )
            );
        } else {
            li.classList.remove('cached');
        }
        li.classList.remove('discard');
        return li;
    };

    var listEntryCountFromGroup = function(listKeys) {
        if ( Array.isArray(listKeys) === false ) { return ''; }
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
        var liGroup = document.querySelector('#lists > .groupEntry[data-groupkey="' + groupKey + '"]');
        if ( liGroup === null ) {
            liGroup = listGroupTemplate.clone().nodeAt(0);
            var groupName = groupNames.get(groupKey);
            if ( groupName === undefined ) {
                groupName = vAPI.i18n('3pGroup' + groupKey.charAt(0).toUpperCase() + groupKey.slice(1));
                // Category "Social" is being renamed "Annoyances": ensure
                // smooth transition.
                // TODO: remove when majority of users are post-1.14.8 uBO.
                if ( groupName === '' && groupKey === 'social' ) {
                    groupName = vAPI.i18n('3pGroupAnnoyances');
                }
                groupNames.set(groupKey, groupName);
            }
            if ( groupName !== '' ) {
                liGroup.querySelector('.geName').textContent = groupName;
            }
        }
        if ( liGroup.querySelector('.geName:empty') === null ) {
            liGroup.querySelector('.geCount').textContent = listEntryCountFromGroup(listKeys);
        }
        var ulGroup = liGroup.querySelector('.listEntries');
        if ( !listKeys ) { return liGroup; }
        listKeys.sort(function(a, b) {
            return (listDetails.available[a].title || '').localeCompare(listDetails.available[b].title || '');
        });
        for ( var i = 0; i < listKeys.length; i++ ) {
            var liEntry = liFromListEntry(listKeys[i], ulGroup.children[i]);
            if ( liEntry.parentElement === null ) {
                ulGroup.appendChild(liEntry);
            }
        }
        return liGroup;
    };

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
        hasCachedContent = false;

        // Incremental rendering: this will allow us to easily discard unused
        // DOM list entries.
        //uDom('#lists .listEntries .listEntry').addClass('discard'); // 25.01.17 Commented by Igor

        ////// 25.01.17 Igor.
        needUpdate = true; //16.06 - Igor. Always enable Update button
        fillFiltersList(getSelectedFilters(listDetails));
        fillAvailableFiltersList();
        //////////////////////////////////////////


        // 25.01.17 Commented by Igor.
        //// Visually split the filter lists in purpose-based groups
        //var ulLists = document.querySelector('#lists'),
        //    groups = groupsFromLists(details.available),
        //    liGroup, i, groupKey,
        //    groupKeys = [
        //        'default',
        //        'ads',
        //        'privacy',
        //        'malware',
        //        'social',
        //        'multipurpose',
        //        'regions',
        //        'custom'
        //    ];
        //for ( i = 0; i < groupKeys.length; i++ ) {
        //    groupKey = groupKeys[i];
        //    liGroup = liFromListGroup(groupKey, groups[groupKey]);
        //    liGroup.setAttribute('data-groupkey', groupKey);
        //    liGroup.classList.toggle(
        //        'collapsed',
        //        vAPI.localStorage.getItem('collapseGroup' + (i + 1)) === 'y'
        //    );
        //    if ( liGroup.parentElement === null ) {
        //        ulLists.appendChild(liGroup);
        //    }
        //    delete groups[groupKey];
        //}
        //// For all groups not covered above (if any left)
        //groupKeys = Object.keys(groups);
        //for ( i = 0; i < groupKeys.length; i++ ) {
        //    groupKey = groupKeys[i];
        //    ulLists.appendChild(liFromListGroup(groupKey, groups[groupKey]));
        //}
        //
        //uDom('#lists .listEntries .listEntry.discard').remove();
        //uDom('#autoUpdate').prop('checked', listDetails.autoUpdate === true);
        //uDom('#listsOfBlockedHostsPrompt').text(
        //    vAPI.i18n('3pListsOfBlockedHostsPrompt')
        //        .replace('{{netFilterCount}}', renderNumber(details.netFilterCount))
        //        .replace('{{cosmeticFilterCount}}', renderNumber(details.cosmeticFilterCount))
        //);


        ////// 25.01.17 Igor. Here was this code before merging.
        toggleCheckbox(('#autoUpdate'), listDetails.autoUpdate === true);
        toggleCheckbox(('#parseCosmeticFilters'), listDetails.parseCosmeticFilters === true);
        //////////////////////////////////////////

        // Compute a hash of the settings so that we can keep track of changes
        // affecting the loading of filter lists.
        //uDom('#parseCosmeticFilters').prop('checked', listDetails.parseCosmeticFilters === true);
        //uDom('#ignoreGenericCosmeticFilters').prop('checked', listDetails.ignoreGenericCosmeticFilters === true);
        //if ( !soft ) {
        //    filteringSettingsHash = hashFromCurrentFromSettings();
        //}
        renderWidgets();
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

                if (path == "user-filters") { // always set user-filters to first position
                    fragment.insertBefore(filter, fragment.firstChild)
                }
                else
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

            if (group == "default") {
                groups[group] = ["user-filters"];
            }

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


    var createFilterItem = function (data) {
        try {
            var template = $("#filter_template").html();
            template = template.replace(new RegExp('{{delete_possibility}}', 'g'), (data.path === listDetails.userFiltersPath ? "disabled" : ""));
            template = template.replace(new RegExp('{{path}}', 'g'), data.path);
            template = template.replace(new RegExp('{{inuse_checked}}', 'g'), (data.inUse ? "checked" : ""));
            template = template.replace(new RegExp('{{default_disabled}}', 'g'), data.defaultOff ? "disabled" : "");
            template = template.replace(new RegExp("{{title}}", 'g'), data.title || "");
            template = template.replace(new RegExp("{{url}}", 'g'), getFilterUrl(data));
            template = template.replace(new RegExp("{{group}}", 'g'), data.group || "");
            if (data.error) {
                template = template.replace(new RegExp("{{last_update}}", 'g'), data.error.error);
                template = template.replace(new RegExp("{{error}}", 'g'), "error");
            }
            else {
                var date = new Date(data.lastModified);
                //var date = new Date(data.lastUpdate);

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

    var getFilterUrl = function (filterData) {
        var url = "#";

        if (filterData.path == "user-filters") {
            return url;
        }

        if (filterData.contentURL) {
            if (typeof filterData.contentURL == "String") {
                url = filterData.contentURL;
            }
            else {
                url = filterData.contentURL[0];
            }
        }
        else if (filterData.supportURL) {
            url = filterData.supportURL;
        }
        return url;
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

var renderWidgets = function() {
    uDom('#buttonUpdate').toggleClass('disabled', !listsContentChanged());
    uDom('#buttonPurgeAll').toggleClass('disabled', !hasCachedContent);

    //uDom('#buttonApply').toggleClass('disabled', filteringSettingsHash === hashFromCurrentFromSettings());
    //uDom('#buttonPurgeAll').toggleClass(
    //    'disabled',
    //    document.querySelector('#lists .listEntry.cached:not(.obsolete)') === null
    //);
    //uDom('#buttonUpdate').toggleClass('disabled', document.querySelector('body:not(.updating) #lists .listEntry.obsolete > input[type="checkbox"]:checked') === null);
};

/******************************************************************************/

var updateAssetStatus = function(details) {
    return;
    var li = document.querySelector('#lists .listEntry[data-listkey="' + details.key + '"]');
    if ( li === null ) { return; }
    li.classList.toggle('failed', !!details.failed);
    li.classList.toggle('obsolete', !details.cached);
    li.classList.toggle('cached', !!details.cached);
    if ( details.cached ) {
        li.querySelector('.status.cache').setAttribute(
            'title',
            lastUpdateTemplateString.replace(
                '{{ago}}',
                vAPI.i18n.renderElapsedTimeToString(Date.now())
            )
        );
    }
    renderWidgets();
};

/*******************************************************************************

    Compute a hash from all the settings affecting how filter lists are loaded
    in memory.

**/

var hashFromCurrentFromSettings = function() {
    var hash = [
        document.getElementById('parseCosmeticFilters').checked,
        document.getElementById('ignoreGenericCosmeticFilters').checked
    ];
    var listHash = [],
        listEntries = document.querySelectorAll('#lists .listEntry[data-listkey]:not(.toRemove)'),
        liEntry,
        i = listEntries.length;
    while ( i-- ) {
        liEntry = listEntries[i];
        if ( liEntry.querySelector('input[type="checkbox"]:checked') !== null ) {
            listHash.push(liEntry.getAttribute('data-listkey'));
        }
    }
    hash.push(
        listHash.sort().join(),
        reValidExternalList.test(document.getElementById('externalLists').value),
        document.querySelector('#lists .listEntry.toRemove') !== null
    );
    return hash.join();
};

/******************************************************************************/

var onFilteringSettingsChanged = function() {
    listDetails.parseCosmeticFilters = isChecked(this);
    messaging.send('dashboard', {
        what: 'userSettings',
        name: 'parseAllABPHideFilters',
        value: listDetails.parseCosmeticFilters
    });
    //renderWidgets();
};

/******************************************************************************/

var onRemoveExternalList = function(ev) {
    var liEntry = uDom(this).ancestors('[data-listkey]'),
        listKey = liEntry.attr('data-listkey');
    if ( listKey ) {
        liEntry.toggleClass('toRemove');
        renderWidgets();
    }
    ev.preventDefault();
};

/******************************************************************************/

var onPurgeClicked = function() {
    var button = uDom(this),
        liEntry = button.ancestors('[data-listkey]'),
        listKey = liEntry.attr('data-listkey');
    if ( !listKey ) { return; }

    messaging.send('dashboard', { what: 'purgeCache', assetKey: listKey });

    // If the cached version is purged, the installed version must be assumed
    // to be obsolete.
    // https://github.com/gorhill/uBlock/issues/1733
    //   An external filter list must not be marked as obsolete, they will
    //   always be fetched anyways if there is no cached copy.
    liEntry.addClass('obsolete');
    liEntry.removeClass('cached');

    if ( liEntry.descendants('input').first().prop('checked') ) {
        renderWidgets();
    }
};

/******************************************************************************/

var selectFilterLists = function(callback) {
    // Cosmetic filtering switch
    //messaging.send('dashboard', {
    //    what: 'userSettings',
    //    name: 'parseAllABPHideFilters',
    //    value: document.getElementById('parseCosmeticFilters').checked
    //});
    //messaging.send('dashboard', {
    //    what: 'userSettings',
    //    name: 'ignoreGenericCosmeticFilters',
    //    value: document.getElementById('ignoreGenericCosmeticFilters').checked
    //});

    //var lis = uDom('#filterLists .listRow')

    // Filter lists to select
    var toSelect = [],
        liEntries = document.querySelectorAll('#lists .listEntry[data-listkey]:not(.toRemove)'),
        i = liEntries.length,
        liEntry;
    //while ( i-- ) {
    //    liEntry = liEntries[i];
    //    if ( liEntry.querySelector('input[type="checkbox"]:checked') !== null ) {
    //        toSelect.push(liEntry.getAttribute('data-listkey'));
    //    }
    //}
    var selected = getSelectedFilters(listDetails);
    toSelect = Object.keys(selected);

    // External filter lists to remove
    var toRemove = [];
    liEntries = document.querySelectorAll('#lists .listEntry.toRemove[data-listkey]');
    i = liEntries.length;
    while ( i-- ) {
        toRemove.push(liEntries[i].getAttribute('data-listkey'));
    }

    // External filter lists to import
    //var externalListsElem = document.getElementById('externalLists'),
    //    toImport = externalListsElem.value.trim();
    //externalListsElem.value = '';

    messaging.send(
        'dashboard',
        {
            what: 'applyFilterListSelection',
            toSelect: toSelect,
            //toImport: toImport,
            toImport: "",
            toRemove: toRemove
        },
        callback
    );
    //filteringSettingsHash = hashFromCurrentFromSettings();
};

var buttonApplyHandler = function() {
    //uDom('#buttonApply').removeClass('enabled');
    var onSelectionDone = function() {
        messaging.send('dashboard', { what: 'reloadAllFilters' });
    };
    selectFilterLists(onSelectionDone);
    renderWidgets();
};


var buttonUpdateHandler = function() {
    var onSelectionDone = function() {
        document.body.classList.add('updating');
        messaging.send('dashboard', { what: 'forceUpdateAssets' });
        renderWidgets();
    };
    selectFilterLists(onSelectionDone);
    renderWidgets();
};

/******************************************************************************/

var buttonPurgeAllHandler = function(ev) {
    uDom('#buttonPurgeAll').removeClass('enabled');
    messaging.send(
        'dashboard',
        {
            what: 'purgeAllCaches',
            hard: ev.ctrlKey && ev.shiftKey
        },
        function() { renderFilterLists(true); }
    );
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

var toggleUnusedLists = function() {
    document.body.classList.toggle('hideUnused');
    var hide = document.body.classList.contains('hideUnused');
    uDom('#lists li.listEntry > input[type="checkbox"]:not(:checked)')
        .ancestors('li.listEntry[data-listkey]')
        .css('display', hide ? 'none' : '');
    vAPI.localStorage.setItem('hideUnusedFilterLists', hide ? '1' : '0');
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


/******************************************************************************/

var toCloudData = function() {
    var bin = {
        parseCosmeticFilters: uDom.nodeFromId('parseCosmeticFilters').checked,
        ignoreGenericCosmeticFilters: uDom.nodeFromId('ignoreGenericCosmeticFilters').checked,
        selectedLists: [],
        externalLists: listDetails.externalLists
    };

    var liEntries = uDom('#lists .listEntry'), liEntry;
    var i = liEntries.length;
    while ( i-- ) {
        liEntry = liEntries.at(i);
        if ( liEntry.descendants('input').prop('checked') ) {
            bin.selectedLists.push(liEntry.attr('data-listkey'));
        }
    }

    return bin;
};


var fromCloudData = function(data, append) {
    if ( typeof data !== 'object' || data === null ) { return; }

    var elem, checked, i, n;

    elem = uDom.nodeFromId('parseCosmeticFilters');
    checked = data.parseCosmeticFilters === true || append && elem.checked;
    elem.checked = listDetails.parseCosmeticFilters = checked;

    elem = uDom.nodeFromId('ignoreGenericCosmeticFilters');
    checked = data.ignoreGenericCosmeticFilters === true || append && elem.checked;
    elem.checked = listDetails.ignoreGenericCosmeticFilters = checked;

    var selectedSet = new Set(data.selectedLists),
        listEntries = uDom('#lists .listEntry'),
        listEntry, listKey, input;
    for ( i = 0, n = listEntries.length; i < n; i++ ) {
        listEntry = listEntries.at(i);
        listKey = listEntry.attr('data-listkey');
        input = listEntry.descendants('input').first();
        if ( append && input.prop('checked') ) { continue; }
        input.prop('checked', selectedSet.has(listKey) );
    }

    elem = uDom.nodeFromId('externalLists');
    if ( !append ) { elem.value = ''; }
    elem.value += data.externalLists || '';

    renderWidgets();
};

// 25.01.17 Igor. Commented because self.cloud doesn't exists and cause an exception
//self.cloud.onPush = toCloudData;
//self.cloud.onPull = fromCloudData;

/******************************************************************************/
    // 25.01.17 Igor. Custom methods. This methods was here before merging new version.
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
        var switches = [];
        switches.push({
            assetKey: path,
            defaultOff: defaultOff,
            inUse: inUse,
            off: off
        });
        messaging.send('dashboard', {
            what: 'updateFilterState',
            switches: switches,
            update: true
        });

        var filter = listDetails.available ? listDetails.available[path] : null;
        if (filter) filter.off = !!off;
        filter = listDetails.current ? listDetails.current[path] : null;
        if (filter) filter.off = !!off;
        buttonApplyHandler();
    };

    var addExternal = function () {
        var filterData = {
            title: $("#customSubscriptionTitle").val() || "",
            group: $("#customSubscriptionGroup").val() || "",
            location: $("#customSubscriptionLocation").val() || ""
        };

        //renderBusyOverlay(true);
        messaging.send('dashboard', {
            what: 'addExternalFilter',
            filter: filterData,
            update: true
        });
        return true;
    };

    // Return whether content need update.
    var listsContentChanged = function() {
        return needUpdate;
    };

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

    var getSelectedFilters = function (listDetails) {
        var selectedFilters = {};
        for (var path in listDetails.current) {
            try {
                var current = listDetails.current[path];
                var available = listDetails.available[path];
                if (typeof available.off == "boolean" && !available.off) {
                    selectedFilters[path] = current;
                    if (!selectedFilters[path].title)
                        selectedFilters[path].title = listNameFromListKey(path);
                    //if (listDetails.cache[path] && listDetails.cache[path].lastModified)
                    if (listDetails.cache[path] && listDetails.cache[path].writeTime)
                        //selectedFilters[path].lastModified = listDetails.cache[path].lastModified;
                        selectedFilters[path].lastModified = listDetails.cache[path].writeTime;
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



    /******************************************************************************/

    var niceScroll = function () {
        $("html").niceScroll({cursorcolor:"#49854F", autohidemode: false});
    };

    // END OF CUSTOM METHODS
    /******************************************************************************/
    /******************************************************************************/


document.body.classList.toggle(
    'hideUnused',
    vAPI.localStorage.getItem('hideUnusedFilterLists') === '1'
);

//*************************************************************
uDom("#startSubscriptionSelection").on("click", startSubscriptionSelection);
uDom('#addSubscription').on('click', addSubscriptionBtnClick);
//*************************************************************

uDom('#autoUpdate').on('click', autoUpdateCheckboxChanged);
uDom('#parseCosmeticFilters').on('click', onFilteringSettingsChanged);
//uDom('#ignoreGenericCosmeticFilters').on('change', onFilteringSettingsChanged);
//uDom('#buttonApply').on('click', buttonApplyHandler);
uDom('#buttonUpdate').on('click', buttonUpdateHandler);
uDom('#buttonPurgeAll').on('click', buttonPurgeAllHandler);
//uDom('#listsOfBlockedHostsPrompt').on('click', toggleUnusedLists);
//uDom('#lists').on('click', '.groupEntry > span', groupEntryClickHandler);
//uDom('#lists').on('change', '.listEntry > input', onFilteringSettingsChanged);
//uDom('#lists').on('click', '.listEntry > a.remove', onRemoveExternalList);
//uDom('#lists').on('click', 'span.cache', onPurgeClicked);
//uDom('#externalLists').on('input', onFilteringSettingsChanged);

handleCheckboxes(); // 25.01.17 Igor.

renderFilterLists();

//renderExternalLists(); // 25.01.17 Igor.
niceScroll(); // 25.01.17 Igor.

/******************************************************************************/

})();


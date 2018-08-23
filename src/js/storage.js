/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-present Raymond Hill

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

/* global punycode, publicSuffixList */

'use strict';

/******************************************************************************/

µBlock.getBytesInUse = function(callback) {
    if ( typeof callback !== 'function' ) {
        callback = this.noopFunc;
    }
    var getBytesInUseHandler = function(bytesInUse) {
        µBlock.storageUsed = bytesInUse;
        callback(bytesInUse);
    };
    // Not all platforms implement this method.
    if ( vAPI.storage.getBytesInUse instanceof Function ) {
        vAPI.storage.getBytesInUse(null, getBytesInUseHandler);
    } else {
        callback();
    }
};

/******************************************************************************/

µBlock.keyvalSetOne = function(key, val, callback) {
    var bin = {};
    bin[key] = val;
    vAPI.storage.set(bin, callback || this.noopFunc);
};

/******************************************************************************/

µBlock.saveLocalSettings = (function() {
    let saveAfter = 4 * 60 * 1000;

    let onTimeout = ( ) => {
        let µb = µBlock;
        if ( µb.localSettingsLastModified > µb.localSettingsLastSaved ) {
            µb.saveLocalSettings();
        }
        vAPI.setTimeout(onTimeout, saveAfter);
    };

    vAPI.setTimeout(onTimeout, saveAfter);

    return function(callback) {
        this.localSettingsLastSaved = Date.now();
        vAPI.storage.set(this.localSettings, callback);
    };
})();

/******************************************************************************/

µBlock.saveUserSettings = function() {
    vAPI.storage.set(this.userSettings);
};

/******************************************************************************/

µBlock.loadHiddenSettings = function() {
    var onLoaded = function(bin) {
        if ( bin instanceof Object === false ) { return; }
        var µb = µBlock,
            hs = bin.hiddenSettings;
        // Remove following condition once 1.15.12+ is widespread.
        if (
            hs instanceof Object === false &&
            typeof bin.hiddenSettingsString === 'string'
        ) {
            vAPI.storage.remove('hiddenSettingsString');
            hs = µBlock.hiddenSettingsFromString(bin.hiddenSettingsString);
        }
        if ( hs instanceof Object ) {
            var hsDefault = µb.hiddenSettingsDefault;
            for ( var key in hsDefault ) {
                if (
                    hsDefault.hasOwnProperty(key) &&
                    hs.hasOwnProperty(key) &&
                    typeof hs[key] === typeof hsDefault[key]
                ) {
                    µb.hiddenSettings[key] = hs[key];
                }
            }
            // To remove once 1.15.26 is widespread. The reason is to ensure
            // the change in the following commit is taken into account:
            // https://github.com/gorhill/uBlock/commit/8071321e9104
            if ( hs.manualUpdateAssetFetchPeriod === 2000 ) {
                µb.hiddenSettings.manualUpdateAssetFetchPeriod =
                    µb.hiddenSettingsDefault.manualUpdateAssetFetchPeriod;
                hs.manualUpdateAssetFetchPeriod = undefined;
                µb.saveHiddenSettings();
            }
        }
        if ( vAPI.localStorage.getItem('immediateHiddenSettings') === null ) {
            µb.saveImmediateHiddenSettings();
        }
    };

    vAPI.storage.get(
        [ 'hiddenSettings', 'hiddenSettingsString'],
        onLoaded
    );
};

// Note: Save only the settings which values differ from the default ones.
// This way the new default values in the future will properly apply for those
// which were not modified by the user.

µBlock.saveHiddenSettings = function(callback) {
    var bin = { hiddenSettings: {} };
    for ( var prop in this.hiddenSettings ) {
        if (
            this.hiddenSettings.hasOwnProperty(prop) &&
            this.hiddenSettings[prop] !== this.hiddenSettingsDefault[prop]
        ) {
            bin.hiddenSettings[prop] = this.hiddenSettings[prop];
        }
    }
    vAPI.storage.set(bin, callback);
    this.saveImmediateHiddenSettings();
};

/******************************************************************************/

µBlock.hiddenSettingsFromString = function(raw) {
    var out = Object.assign({}, this.hiddenSettingsDefault),
        lineIter = new this.LineIterator(raw),
        line, matches, name, value;
    while ( lineIter.eot() === false ) {
        line = lineIter.next();
        matches = /^\s*(\S+)\s+(.+)$/.exec(line);
        if ( matches === null || matches.length !== 3 ) { continue; }
        name = matches[1];
        if ( out.hasOwnProperty(name) === false ) { continue; }
        value = matches[2];
        switch ( typeof out[name] ) {
        case 'boolean':
            if ( value === 'true' ) {
                out[name] = true;
            } else if ( value === 'false' ) {
                out[name] = false;
            }
            break;
        case 'string':
            out[name] = value;
            break;
        case 'number':
            out[name] = parseInt(value, 10);
            if ( isNaN(out[name]) ) {
                out[name] = this.hiddenSettingsDefault[name];
            }
            break;
        default:
            break;
        }
    }
    return out;
};

µBlock.stringFromHiddenSettings = function() {
    var out = [],
        keys = Object.keys(this.hiddenSettings).sort();
    for ( var key of keys ) {
        out.push(key + ' ' + this.hiddenSettings[key]);
    }
    return out.join('\n');
};

/******************************************************************************/

// These settings must be available immediately on startup, without delay
// through the vAPI.localStorage. Add/remove settings as needed.

µBlock.saveImmediateHiddenSettings = function() {
    vAPI.localStorage.setItem(
        'immediateHiddenSettings',
        JSON.stringify({
            suspendTabsUntilReady: this.hiddenSettings.suspendTabsUntilReady,
            userResourcesLocation: this.hiddenSettings.userResourcesLocation
        })
    );
};

// Do this here to have these hidden settings loaded ASAP.
µBlock.loadHiddenSettings();

/******************************************************************************/

µBlock.savePermanentFirewallRules = function() {
    this.keyvalSetOne('dynamicFilteringString', this.permanentFirewall.toString());
};

/******************************************************************************/

µBlock.savePermanentURLFilteringRules = function() {
    this.keyvalSetOne('urlFilteringString', this.permanentURLFiltering.toString());
};

/******************************************************************************/

µBlock.saveHostnameSwitches = function() {
    this.keyvalSetOne('hostnameSwitchesString', this.hnSwitches.toString());
};

/******************************************************************************/

µBlock.saveWhitelist = function() {
    this.keyvalSetOne('netWhitelist', this.stringFromWhitelist(this.netWhitelist));
    this.netWhitelistModifyTime = Date.now();
};

/*******************************************************************************

    TODO(seamless migration):
    The code related to 'remoteBlacklist' can be removed when I am confident
    all users have moved to a version of uBO which no longer depends on
    the property 'remoteBlacklists, i.e. v1.11 and beyond.

**/

µBlock.loadSelectedFilterLists = function(callback) {
    var µb = this;
    vAPI.storage.get('selectedFilterLists', function(bin) {
        // Select default filter lists if first-time launch.
        if ( !bin || Array.isArray(bin.selectedFilterLists) === false ) {
            µb.assets.metadata(function(availableLists) {
                µb.saveSelectedFilterLists(
                    µb.autoSelectRegionalFilterLists(availableLists)
                );
                callback();
            });
            return;
        }
        // TODO: Removes once 1.1.15 is in widespread use.
        // https://github.com/gorhill/uBlock/issues/3383
        vAPI.storage.remove('remoteBlacklists');
        µb.selectedFilterLists = bin.selectedFilterLists;
        callback();
    });
};

µBlock.saveSelectedFilterLists = function(newKeys, append, callback) {
    if ( typeof append === 'function' ) {
        callback = append;
        append = false;
    }
    var oldKeys = this.selectedFilterLists.slice();
    if ( append ) {
        newKeys = newKeys.concat(oldKeys);
    }
    var newSet = new Set(newKeys);
    // Purge unused filter lists from cache.
    for ( var i = 0, n = oldKeys.length; i < n; i++ ) {
        if ( newSet.has(oldKeys[i]) === false ) {
            this.removeFilterList(oldKeys[i]);
        }
    }
    newKeys = Array.from(newSet);
    var bin = {
        selectedFilterLists: newKeys
    };
    this.selectedFilterLists = newKeys;
    vAPI.storage.set(bin, callback);
};

/******************************************************************************/

µBlock.applyFilterListSelection = function(details, callback) {
    var µb = this,
        selectedListKeySet = new Set(this.selectedFilterLists),
        externalLists = this.userSettings.externalLists,
        i, n, assetKey;

    // Filter lists to select
    if ( Array.isArray(details.toSelect) ) {
        if ( details.merge ) {
            for ( i = 0, n = details.toSelect.length; i < n; i++ ) {
                selectedListKeySet.add(details.toSelect[i]);
            }
        } else {
            selectedListKeySet = new Set(details.toSelect);
        }
    }

    // Imported filter lists to remove
    if ( Array.isArray(details.toRemove) ) {
        var removeURLFromHaystack = function(haystack, needle) {
            return haystack.replace(
                new RegExp(
                    '(^|\\n)' +
                    µb.escapeRegex(needle) +
                    '(\\n|$)', 'g'),
                '\n'
            ).trim();
        };
        for ( i = 0, n = details.toRemove.length; i < n; i++ ) {
            assetKey = details.toRemove[i];
            selectedListKeySet.delete(assetKey);
            externalLists = removeURLFromHaystack(externalLists, assetKey);
            this.removeFilterList(assetKey);
        }
    }

    // Filter lists to import
    if ( typeof details.toImport === 'string' ) {
        // https://github.com/gorhill/uBlock/issues/1181
        //   Try mapping the URL of an imported filter list to the assetKey of an
        //   existing stock list.
        var assetKeyFromURL = function(url) {
            var needle = url.replace(/^https?:/, '');
            var assets = µb.availableFilterLists, asset;
            for ( var assetKey in assets ) {
                asset = assets[assetKey];
                if ( asset.content !== 'filters' ) { continue; }
                if ( typeof asset.contentURL === 'string' ) {
                    if ( asset.contentURL.endsWith(needle) ) { return assetKey; }
                    continue;
                }
                if ( Array.isArray(asset.contentURL) === false ) { continue; }
                for ( i = 0, n = asset.contentURL.length; i < n; i++ ) {
                    if ( asset.contentURL[i].endsWith(needle) ) {
                        return assetKey;
                    }
                }
            }
            return url;
        };
        var importedSet = new Set(this.listKeysFromCustomFilterLists(externalLists)),
            toImportSet = new Set(this.listKeysFromCustomFilterLists(details.toImport));
        for ( var urlKey of toImportSet ) {
            if ( importedSet.has(urlKey) ) { continue; }
            assetKey = assetKeyFromURL(urlKey);
            if ( assetKey === urlKey ) {
                importedSet.add(urlKey);
            }
            selectedListKeySet.add(assetKey);
        }
        externalLists = Array.from(importedSet).sort().join('\n');
    }

    var result = Array.from(selectedListKeySet);
    if ( externalLists !== this.userSettings.externalLists ) {
        this.userSettings.externalLists = externalLists;
        vAPI.storage.set({ externalLists: externalLists });
    }
    this.saveSelectedFilterLists(result);
    if ( typeof callback === 'function' ) {
        callback(result);
    }
};

/******************************************************************************/

µBlock.listKeysFromCustomFilterLists = function(raw) {
    var out = new Set(),
        reIgnore = /^[!#]/,
        reValid = /^[a-z-]+:\/\/\S+/,
        lineIter = new this.LineIterator(raw),
        location;
    while ( lineIter.eot() === false ) {
        location = lineIter.next().trim();
        if ( reIgnore.test(location) || !reValid.test(location) ) {
            continue;
        }
        out.add(location);
    }
    return Array.from(out);
};

/******************************************************************************/

µBlock.saveUserFilters = function(content, callback) {
    // https://github.com/gorhill/uBlock/issues/1022
    // Be sure to end with an empty line.
    content = content.trim();
    if ( content !== '' ) { content += '\n'; }
    this.assets.put(this.userFiltersPath, content, callback);
    this.removeCompiledFilterList(this.userFiltersPath);
};

µBlock.loadUserFilters = function(callback) {
    return this.assets.get(this.userFiltersPath, callback);
};

/******************************************************************************/

µBlock.appendUserFilters = function(filters) {
    if ( filters.length === 0 ) { return; }

    var µb = this;
    var onSaved = function() {
        var compiledFilters = µb.compileFilters(filters, µb.userFiltersPath),
            snfe = µb.staticNetFilteringEngine,
            cfe = µb.cosmeticFilteringEngine,
            acceptedCount = snfe.acceptedCount + cfe.acceptedCount,
            discardedCount = snfe.discardedCount + cfe.discardedCount;
        µb.applyCompiledFilters(compiledFilters, true, µb.userFiltersPath);
        var entry = µb.availableFilterLists[µb.userFiltersPath],
            deltaEntryCount = snfe.acceptedCount + cfe.acceptedCount - acceptedCount,
            deltaEntryUsedCount = deltaEntryCount - (snfe.discardedCount + cfe.discardedCount - discardedCount);
        entry.entryCount += deltaEntryCount;
        entry.entryUsedCount += deltaEntryUsedCount;
        vAPI.storage.set({ 'availableFilterLists': µb.availableFilterLists });
        µb.staticNetFilteringEngine.freeze();
        µb.redirectEngine.freeze();
        µb.staticExtFilteringEngine.freeze();
        µb.selfieManager.destroy();
    };

    var onLoaded = function(details) {
        if ( details.error ) { return; }
        // https://github.com/chrisaljoudi/uBlock/issues/976
        // If we reached this point, the filter quite probably needs to be
        // added for sure: do not try to be too smart, trying to avoid
        // duplicates at this point may lead to more issues.
        µb.saveUserFilters(details.content.trim() + '\n\n' + filters.trim(), onSaved);
    };

    this.loadUserFilters(onLoaded);
};

/******************************************************************************/

µBlock.autoSelectRegionalFilterLists = function(lists) {
    var selectedListKeys = [ this.userFiltersPath ],
        list;
    for ( var key in lists ) {
        if ( lists.hasOwnProperty(key) === false ) { continue; }
        list = lists[key];
        if ( list.off !== true ) {
            selectedListKeys.push(key);
            continue;
        }
        if ( this.listMatchesEnvironment(list) ) {
            selectedListKeys.push(key);
            list.off = false;
        }
    }
    return selectedListKeys;
};

/******************************************************************************/

µBlock.getAvailableLists = function(callback) {
    var µb = this,
        oldAvailableLists = {},
        newAvailableLists = {};

    // User filter list.
    newAvailableLists[this.userFiltersPath] = {
        group: 'user',
        title: vAPI.i18n('1pPageName'),
        defaultOff: false,
        inUse: true
    };

    // Custom filter lists.
    var importedListKeys = this.listKeysFromCustomFilterLists(µb.userSettings.externalLists),
        i = importedListKeys.length, listKey, entry;
    while ( i-- ) {
        listKey = importedListKeys[i];
        entry = {
            content: 'filters',
            contentURL: listKey,
            external: true,
            group: 'custom',
            submitter: 'user',
            title: ''
        };
        newAvailableLists[listKey] = entry;
        this.assets.registerAssetSource(listKey, entry);
    }

    // Convert a no longer existing stock list into an imported list.
    var customListFromStockList = function(assetKey) {
        var oldEntry = oldAvailableLists[assetKey];
        if ( oldEntry === undefined || oldEntry.off === true ) { return; }
        var listURL = oldEntry.contentURL;
        if ( Array.isArray(listURL) ) {
            listURL = listURL[0];
        }
        var newEntry = {
            content: 'filters',
            contentURL: listURL,
            external: true,
            group: 'custom',
            submitter: 'user',
            title: oldEntry.title || ''
        };
        newAvailableLists[listURL] = newEntry;
        µb.assets.registerAssetSource(listURL, newEntry);
        importedListKeys.push(listURL);
        µb.userSettings.externalLists += '\n' + listURL;
        µb.userSettings.externalLists = µb.userSettings.externalLists.trim();
        vAPI.storage.set({ externalLists: µb.userSettings.externalLists });
        µb.saveSelectedFilterLists([ listURL ], true);
    };

    // Final steps:
    // - reuse existing list metadata if any;
    // - unregister unreferenced imported filter lists if any.
    var finalize = function() {
        var assetKey, newEntry, oldEntry;

        // Reuse existing metadata.
        for ( assetKey in oldAvailableLists ) {
            oldEntry = oldAvailableLists[assetKey];
            newEntry = newAvailableLists[assetKey];
            // List no longer exists. If a stock list, try to convert to
            // imported list if it was selected.
            if ( newEntry === undefined ) {
                µb.removeFilterList(assetKey);
                if ( assetKey.indexOf('://') === -1 ) {
                    customListFromStockList(assetKey);
                }
                continue;
            }
            if ( oldEntry.entryCount !== undefined ) {
                newEntry.entryCount = oldEntry.entryCount;
            }
            if ( oldEntry.entryUsedCount !== undefined ) {
                newEntry.entryUsedCount = oldEntry.entryUsedCount;
            }
            // This may happen if the list name was pulled from the list
            // content.
            // https://github.com/chrisaljoudi/uBlock/issues/982
            // There is no guarantee the title was successfully extracted from
            // the list content.
            if (
                newEntry.title === '' &&
                typeof oldEntry.title === 'string' &&
                oldEntry.title !== ''
            ) {
                newEntry.title = oldEntry.title;
            }
            if (oldEntry.hasOwnProperty("defaultOff")) {
                newEntry.defaultOff = oldEntry.defaultOff;
            }
            else if (assetKey == "user-filters" && oldEntry.group === "default")
            {// first loaded user-filter set to default enabled
                newEntry.defaultOff = false;
            }
            else {// all other filters set to off by default
                newEntry.defaultOff = true;
            }

            if (oldEntry.hasOwnProperty("inUse")) {
                newEntry.inUse = oldEntry.inUse;
            }
            else {// all other filters not used by default
                newEntry.inUse = true;
            }
            if (oldEntry.hasOwnProperty("exceptions")) {
                newEntry.exceptions = oldEntry.exceptions;
            }
            // used only for for filters not from default uBlock list.
            newEntry.lastUpdate = oldEntry.hasOwnProperty("lastUpdate") ?
                oldEntry.lastUpdate : Date.now();
            
        }

        // Remove unreferenced imported filter lists.
        var dict = new Set(importedListKeys);
        for ( assetKey in newAvailableLists ) {
            newEntry = newAvailableLists[assetKey];
            if ( newEntry.submitter !== 'user' ) { continue; }
            if ( dict.has(assetKey) ) { continue; }
            delete newAvailableLists[assetKey];
            µb.assets.unregisterAssetSource(assetKey);
            µb.removeFilterList(assetKey);
        }
    };

    // Built-in filter lists loaded.
    var onBuiltinListsLoaded = function(entries) {
        for ( var assetKey in entries ) {
            if ( entries.hasOwnProperty(assetKey) === false ) { continue; }
            entry = entries[assetKey];
            if ( entry.content !== 'filters' ) { continue; }
            newAvailableLists[assetKey] = Object.assign({}, entry);
        }

        // Load set of currently selected filter lists.
        var listKeySet = new Set(µb.selectedFilterLists);
        for ( listKey in newAvailableLists ) {
            if ( newAvailableLists.hasOwnProperty(listKey) ) {
                newAvailableLists[listKey].off = !listKeySet.has(listKey);
            }
        }

        finalize();
        callback(newAvailableLists);
    };

    // Available lists previously computed.
    var onOldAvailableListsLoaded = function(bin) {
        oldAvailableLists = bin && bin.availableFilterLists || {};
        µb.assets.metadata(onBuiltinListsLoaded);
    };

    // Load previously saved available lists -- these contains data
    // computed at run-time, we will reuse this data if possible.
    vAPI.storage.get('availableFilterLists', onOldAvailableListsLoaded);
};

/******************************************************************************/

// This is used to be re-entrancy resistant.
µBlock.loadingFilterLists = false;

µBlock.loadFilterLists = function(callback) {
    // Callers are expected to check this first.
    if ( this.loadingFilterLists ) {
        return;
    }
    this.loadingFilterLists = true;

    var µb = this,
        filterlistsCount = 0,
        loadedListKeys = [];

    if ( typeof callback !== 'function' ) {
        callback = this.noopFunc;
    }

    var onDone = function() {
        µb.staticNetFilteringEngine.freeze();
        µb.staticExtFilteringEngine.freeze();
        µb.redirectEngine.freeze();
        vAPI.storage.set({ 'availableFilterLists': µb.availableFilterLists });

        vAPI.messaging.broadcast({
            what: 'staticFilteringDataChanged',
            parseCosmeticFilters: µb.userSettings.parseAllABPHideFilters,
            ignoreGenericCosmeticFilters: µb.userSettings.ignoreGenericCosmeticFilters,
            listKeys: loadedListKeys
        });

        callback();

        µb.selfieManager.destroy();
        µb.loadingFilterLists = false;
    };

    var applyCompiledFilters = function(assetKey, compiled) {
        var snfe = µb.staticNetFilteringEngine,
            sxfe = µb.staticExtFilteringEngine,
            acceptedCount = snfe.acceptedCount + sxfe.acceptedCount,
            discardedCount = snfe.discardedCount + sxfe.discardedCount;
        µb.applyCompiledFilters(compiled, assetKey === µb.userFiltersPath, assetKey);
        if ( µb.availableFilterLists.hasOwnProperty(assetKey) ) {
            var entry = µb.availableFilterLists[assetKey];
            entry.entryCount = snfe.acceptedCount + sxfe.acceptedCount -
                acceptedCount;
            entry.entryUsedCount = entry.entryCount -
                (snfe.discardedCount + sxfe.discardedCount - discardedCount);
        }
        loadedListKeys.push(assetKey);
    };

    var onCompiledListLoaded = function(details) {
        applyCompiledFilters(details.assetKey, details.content);
        filterlistsCount -= 1;
        if ( filterlistsCount === 0 ) {
            onDone();
        }
    };

    var onFilterListsReady = function(lists) {
        µb.availableFilterLists = lists;

        µb.redirectEngine.reset();
        µb.staticExtFilteringEngine.reset();
        µb.staticNetFilteringEngine.reset();
        µb.selfieManager.destroy();
        µb.staticFilteringReverseLookup.resetLists();

        µb.userCosmeticFilters.reset();

        // We need to build a complete list of assets to pull first: this is
        // because it *may* happens that some load operations are synchronous:
        // This happens for assets which do not exist, ot assets with no
        // content.
        var toLoad = [];
        for ( var assetKey in lists ) {
            if ( lists.hasOwnProperty(assetKey) === false ) { continue; }
            if ( lists[assetKey].off ) { continue; }
            toLoad.push(assetKey);
        }
        filterlistsCount = toLoad.length;
        if ( filterlistsCount === 0 ) {
            return onDone();
        }
        var i = toLoad.length;
        while ( i-- ) {
            µb.getCompiledFilterList(toLoad[i], onCompiledListLoaded);
        }
    };

    this.getAvailableLists(onFilterListsReady);
    this.loadRedirectResources();
};

/******************************************************************************/

µBlock.getCompiledFilterList = function(assetKey, callback) {
    var µb = this,
        compiledPath = 'compiled/' + assetKey,
        rawContent;

    var onCompiledListLoaded2 = function(details) {
        if ( details.content === '' || assetKey === µb.userFiltersPath ) {
            details.content = µb.compileFilters(rawContent, assetKey);
            µb.assets.put(compiledPath, details.content);
        }
        rawContent = undefined;
        details.assetKey = assetKey;
        callback(details);
    };

    var onRawListLoaded = function(details) {
        if ( details.content === '' ) {
            details.assetKey = assetKey;
            callback(details);
            return;
        }
        µb.extractFilterListMetadata(assetKey, details.content);
        // Fectching the raw content may cause the compiled content to be
        // generated somewhere else in uBO, hence we try one last time to
        // fetch the compiled content in case it has become available.
        rawContent = details.content;
        µb.assets.get(compiledPath, onCompiledListLoaded2);
    };

    var onCompiledListLoaded1 = function(details) {
        if ( details.content === '' ) {
            µb.assets.get(assetKey, onRawListLoaded);
            return;
        }
        // Findx.
        // For displaying userFilters rules in a popup we always need to load them from file
        //     and not from compiled. Because compiled data hasn't raws but already parsed/compiled data.
        else if (assetKey === µb.userFiltersPath) {
            details.content = '';
            µb.assets.get(assetKey, onRawListLoaded);
            return;
        }
        details.assetKey = assetKey;
        callback(details);
    };

    this.assets.get(compiledPath, onCompiledListLoaded1);
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/3406
//   Lower minimum update period to 1 day.

µBlock.extractFilterListMetadata = function(assetKey, raw) {
    var listEntry = this.availableFilterLists[assetKey];
    if ( listEntry === undefined ) { return; }
    // Metadata expected to be found at the top of content.
    var head = raw.slice(0, 1024),
        matches, v;
    // https://github.com/gorhill/uBlock/issues/313
    // Always try to fetch the name if this is an external filter list.
    if ( listEntry.title === '' || listEntry.group === 'custom' ) {
        matches = head.match(/(?:^|\n)(?:!|# )[\t ]*Title[\t ]*:([^\n]+)/i);
        if ( matches !== null ) {
            // https://bugs.chromium.org/p/v8/issues/detail?id=2869
            // JSON.stringify/JSON.parse is to work around String.slice()
            // potentially causing the whole raw filter list to be held in
            // memory just because we cut out the title as a substring.
            listEntry.title = JSON.parse(JSON.stringify(matches[1].trim()));
        }
    }
    // Extract update frequency information
    matches = head.match(/(?:^|\n)(?:!|# )[\t ]*Expires[\t ]*:[\t ]*(\d+)[\t ]*(h)?/i);
    if ( matches !== null ) {
        v = Math.max(parseInt(matches[1], 10), 1);
        if ( matches[2] !== undefined ) {
            v = Math.ceil(v / 24);
        }
        if ( v !== listEntry.updateAfter ) {
            this.assets.registerAssetSource(assetKey, { updateAfter: v });
        }
    }
};

/******************************************************************************/

µBlock.removeCompiledFilterList = function(assetKey) {
    this.assets.remove('compiled/' + assetKey);
};

µBlock.removeFilterList = function(assetKey) {
    this.removeCompiledFilterList(assetKey);
    this.assets.remove(assetKey);
};

/******************************************************************************/

µBlock.compileFilters = function(rawText, filterPath) {
    var writer = new this.CompiledLineWriter();

    // Useful references:
    //    https://adblockplus.org/en/filter-cheatsheet
    //    https://adblockplus.org/en/filters
    var staticNetFilteringEngine = this.staticNetFilteringEngine,
        staticExtFilteringEngine = this.staticExtFilteringEngine,
        reIsWhitespaceChar = /\s/,
        reMaybeLocalIp = /^[\d:f]/,
        reIsLocalhostRedirect = /\s+(?:0\.0\.0\.0|broadcasthost|localhost|local|ip6-\w+)\b/,
        reLocalIp = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1|fe80::1%lo0)/,
        line, c, pos,
        lineIter = new this.LineIterator(this.processDirectives(rawText));
    var isInUse = µBlock.isInUse(filterPath);

    while ( lineIter.eot() === false ) {
        // rhill 2014-04-18: The trim is important here, as without it there
        // could be a lingering `\r` which would cause problems in the
        // following parsing code.
        line = lineIter.next().trim();
        if ( line.length === 0 ) { continue; }

        // Strip comments
        c = line.charAt(0);
        if ( c === '!' || c === '[' ) { continue; }
        if (!isInUse) { continue; }

        // Parse or skip cosmetic filters
        // All cosmetic filters are caught here
        if ( staticExtFilteringEngine.compile(line, writer, filterPath) ) { continue; }

        // Whatever else is next can be assumed to not be a cosmetic filter

        // Most comments start in first column
        if ( c === '#' ) { continue; }

        // Catch comments somewhere on the line
        // Remove:
        //   ... #blah blah blah
        //   ... # blah blah blah
        // Don't remove:
        //   ...#blah blah blah
        // because some ABP filters uses the `#` character (URL fragment)
        pos = line.indexOf('#');
        if ( pos !== -1 && reIsWhitespaceChar.test(line.charAt(pos - 1)) ) {
            line = line.slice(0, pos).trim();
        }

        // https://github.com/gorhill/httpswitchboard/issues/15
        // Ensure localhost et al. don't end up in the ubiquitous blacklist.
        // With hosts files, we need to remove local IP redirection
        if ( reMaybeLocalIp.test(c) ) {
            // Ignore hosts file redirect configuration
            // 127.0.0.1 localhost
            // 255.255.255.255 broadcasthost
            if ( reIsLocalhostRedirect.test(line) ) { continue; }
            line = line.replace(reLocalIp, '').trim();
        }

        if ( line.length === 0 ) { continue; }

        staticNetFilteringEngine.compile(line, writer, filterPath);
    }

    return writer.toString();
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/1395
//   Added `firstparty` argument: to avoid discarding cosmetic filters when
//   applying 1st-party filters.

µBlock.applyCompiledFilters = function(rawText, firstparty, filterPath) {
    if ( rawText === '' ) { return; }
    var reader = new this.CompiledLineReader(rawText);
    this.staticNetFilteringEngine.fromCompiledContent(reader, filterPath);
    this.staticExtFilteringEngine.fromCompiledContent(reader, {
        skipGenericCosmetic: this.userSettings.ignoreGenericCosmeticFilters,
        skipCosmetic: !firstparty && !this.userSettings.parseAllABPHideFilters
    }, filterPath);
};

/******************************************************************************/

/**
 * Cosmetic rules of "User filters" filter.
 * Used for displaying cosmetic rules of "User filters" in a popup.
 * Also used for adding/removing separate rules to a whitelist
 *      (rules added to exceptions of 'User filters' for a domain)
 * @type {{rules, addRule, reset, toSelfie, fromSelfie}}
 */
µBlock.userCosmeticFilters = (function () {

    /**
     * List of rules data.
     * @type {{raw: string, rule: string, hostname: string}}
     */
    var rules = {};

    var addRule = function (raw, hostnames, rule) {
        var data = {
            raw: raw,             // full raw from filter: domain.com##.header
            rule: rule,             // only rule: ##.header
            hostname: ""       // only domain: domain.com
        };

        if(typeof hostnames === 'string') {
            var hostname = this.URI.domainFromHostnameNoCache(hostnames);
            data.hostname = hostname;
            if (!rules.hasOwnProperty(hostname))
                rules[hostname] = [];
            rules[hostname].push(data);
        }
        else if (typeof hostnames === 'object' && hostnames.length) { // string[]
            // If rule contains multiple hostnames
            hostnames.forEach(function (name) {
                var hostname = this.URI.domainFromHostnameNoCache(name);
                data.hostname = hostname;
                if (!rules.hasOwnProperty(hostname))
                    rules[hostname] = [];
                rules[hostname].push(data);
            }.bind(this));
        }
        else { // Global
            if (!rules.hasOwnProperty(""))
                rules[""] = [];
            rules[""].push(data);
        }
    }.bind(µBlock);

    var clear = function () {
        rules = {};
    };

    var toSelfie = function () {
        try {
            return JSON.stringify(rules);
        }
        catch (exception) {
            console.error("Exception in 'userCosmeticFilters -> toSelfie' (storage.js) :" +
                "\n\trules: ", rules,
                "\n\texception: ", exception);
            return "";
        }
    };

    var fromSelfie = function (data) {
        try {
            rules = JSON.parse(data) || {};
        }
        catch (exception) {
            console.error("Exception in 'userCosmeticFilters -> fromSelfie' (storage.js) :" +
                "\n\tdata: ", data,
                "\n\texception: ", exception);
            rules = {};
        }
    };


    return {
        get rules() {
            return rules;
        },
        addRule: addRule,
        reset: clear,
        toSelfie: toSelfie,
        fromSelfie: fromSelfie
    };
})();


/******************************************************************************/

// https://github.com/AdguardTeam/AdguardBrowserExtension/issues/917

µBlock.processDirectives = function(content) {
    var reIf = /^!#(if|endif)\b([^\n]*)/gm,
        parts = [],
        beg = 0, depth = 0, discard = false;
    while ( beg < content.length ) {
        var match = reIf.exec(content);
        if ( match === null ) { break; }
        if ( match[1] === 'if' ) {
            var expr = match[2].trim();
            var target = expr.startsWith('!');
            if ( target ) { expr = expr.slice(1); }
            var token = this.processDirectives.tokens.get(expr);
            if (
                depth === 0 &&
                discard === false &&
                token !== undefined &&
                vAPI.webextFlavor.soup.has(token) === target
            ) {
                parts.push(content.slice(beg, match.index));
                discard = true;
            }
            depth += 1;
            continue;
        }
        depth -= 1;
        if ( depth < 0 ) { break; }
        if ( depth === 0 && discard ) {
            beg = match.index + match[0].length + 1;
            discard = false;
        }
    }
    if ( depth === 0 && parts.length !== 0 ) {
        parts.push(content.slice(beg));
        content = parts.join('\n');
    }
    return content.trim();
};

µBlock.processDirectives.tokens = new Map([
    [ 'ext_ublock', 'ublock' ],
    [ 'env_chromium', 'chromium' ],
    [ 'env_edge', 'edge' ],
    [ 'env_firefox', 'firefox' ],
    [ 'env_mobile', 'mobile' ],
    [ 'env_safari', 'safari' ],
    [ 'cap_html_filtering', 'html_filtering' ],
    [ 'cap_user_stylesheet', 'user_stylesheet' ]
]);

/******************************************************************************/

µBlock.loadRedirectResources = function(updatedContent) {
    var µb = this,
        content = '';

    var onDone = function() {
        µb.redirectEngine.resourcesFromString(content);
    };

    var onUserResourcesLoaded = function(details) {
        if ( details.content !== '' ) {
            content += '\n\n' + details.content;
        }
        onDone();
    };

    var onResourcesLoaded = function(details) {
        if ( details.content !== '' ) {
            content = details.content;
        }
        if ( µb.hiddenSettings.userResourcesLocation === 'unset' ) {
            return onDone();
        }
        µb.assets.fetchText(µb.hiddenSettings.userResourcesLocation, onUserResourcesLoaded);
    };

    if ( typeof updatedContent === 'string' && updatedContent.length !== 0 ) {
        return onResourcesLoaded({ content: updatedContent });
    }

    var onSelfieReady = function(success) {
        if ( success !== true ) {
            µb.assets.get('ublock-resources', onResourcesLoaded);
        }
    };

    µb.redirectEngine.resourcesFromSelfie(onSelfieReady);
};

/******************************************************************************/

µBlock.loadPublicSuffixList = function(callback) {
    var µb = this,
        assetKey = µb.pslAssetKey,
        compiledAssetKey = 'compiled/' + assetKey;

    if ( typeof callback !== 'function' ) {
        callback = this.noopFunc;
    }
    var onRawListLoaded = function(details) {
        if ( details.content !== '' ) {
            µb.compilePublicSuffixList(details.content);
        }
        callback();
    };

    var onCompiledListLoaded = function(details) {
        var selfie;
        try {
            selfie = JSON.parse(details.content);
        } catch (ex) {
        }
        if (
            selfie === undefined ||
            publicSuffixList.fromSelfie(selfie) === false
        ) {
            µb.assets.get(assetKey, onRawListLoaded);
            return;
        }
        callback();
    };

    this.assets.get(compiledAssetKey, onCompiledListLoaded);
};

/******************************************************************************/

µBlock.compilePublicSuffixList = function(content) {
    publicSuffixList.parse(content, punycode.toASCII);
    this.assets.put(
        'compiled/' + this.pslAssetKey,
        JSON.stringify(publicSuffixList.toSelfie())
    );
};

/******************************************************************************/

// This is to be sure the selfie is generated in a sane manner: the selfie will
// be generated if the user doesn't change his filter lists selection for
// some set time.

µBlock.selfieManager = (function() {
    let µb = µBlock;
    let timer = null;

    // As of 2018-05-31:
    // JSON.stringify-ing ourselves results in a better baseline
    // memory usage at selfie-load time. For some reasons.

    let create = function() {
        timer = null;
        let selfie = {
            magic: µb.systemSettings.selfieMagic,
            availableFilterLists: JSON.stringify(µb.availableFilterLists),
            staticNetFilteringEngine: JSON.stringify(µb.staticNetFilteringEngine.toSelfie()),
            redirectEngine: JSON.stringify(µb.redirectEngine.toSelfie()),
            staticExtFilteringEngine: JSON.stringify(µb.staticExtFilteringEngine.toSelfie()),
            userCosmeticFilters: µb.userCosmeticFilters.toSelfie()
        };
        vAPI.cacheStorage.set({ selfie: selfie });
    };

    let load = function(callback) {
        vAPI.cacheStorage.get('selfie', function(bin) {
            if (
                bin instanceof Object === false ||
                bin.selfie instanceof Object === false ||
                bin.selfie.magic !== µb.systemSettings.selfieMagic ||
                bin.selfie.redirectEngine === undefined ||
                bin.selfie.userCosmeticFilters === undefined
            ) {
                return callback(false);
            }
            µb.availableFilterLists = JSON.parse(bin.selfie.availableFilterLists);
            µb.staticNetFilteringEngine.fromSelfie(JSON.parse(bin.selfie.staticNetFilteringEngine));
            µb.redirectEngine.fromSelfie(JSON.parse(bin.selfie.redirectEngine));
            µb.staticExtFilteringEngine.fromSelfie(JSON.parse(bin.selfie.staticExtFilteringEngine));
            µb.userCosmeticFilters.fromSelfie(bin.selfie.userCosmeticFilters);
            callback(true);
        });
    };

    let destroy = function(after) {
        if ( timer !== null ) {
            clearTimeout(timer);
            timer = null;
        }
        vAPI.cacheStorage.remove('selfie');

        if ( typeof after !== 'number' ) {
            after = µb.selfieAfter;
        }
        timer = vAPI.setTimeout(create, after);
    };

    return {
        load: load,
        destroy: destroy
    };
})();

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/531
// Overwrite user settings with admin settings if present.
//
// Admin settings match layout of a uBlock backup. Not all data is
// necessarily present, i.e. administrators may removed entries which
// values are left to the user's choice.

µBlock.restoreAdminSettings = function(callback) {
    // Support for vAPI.adminStorage is optional (webext).
    if ( vAPI.adminStorage instanceof Object === false ) {
        callback();
        return;
    }

    var onRead = function(json) {
        var µb = µBlock;
        var data;
        if ( typeof json === 'string' && json !== '' ) {
            try {
                data = JSON.parse(json);
            } catch (ex) {
                console.error(ex);
            }
        }

        if ( typeof data !== 'object' || data === null ) {
            callback();
            return;
        }

        var bin = {};
        var binNotEmpty = false;

        // Allows an admin to set their own 'assets.json' file, with their own
        // set of stock assets.
        if ( typeof data.assetsBootstrapLocation === 'string' ) {
            bin.assetsBootstrapLocation = data.assetsBootstrapLocation;
            binNotEmpty = true;
        }

        if ( typeof data.userSettings === 'object' ) {
            for ( var name in µb.userSettings ) {
                if ( µb.userSettings.hasOwnProperty(name) === false ) {
                    continue;
                }
                if ( data.userSettings.hasOwnProperty(name) === false ) {
                    continue;
                }
                bin[name] = data.userSettings[name];
                binNotEmpty = true;
            }
        }

        // 'selectedFilterLists' is an array of filter list tokens. Each token
        // is a reference to an asset in 'assets.json'.
        if ( Array.isArray(data.selectedFilterLists) ) {
            bin.selectedFilterLists = data.selectedFilterLists;
            binNotEmpty = true;
        }

        if ( typeof data.netWhitelist === 'string' ) {
            bin.netWhitelist = data.netWhitelist;
            binNotEmpty = true;
        }

        if ( typeof data.dynamicFilteringString === 'string' ) {
            bin.dynamicFilteringString = data.dynamicFilteringString;
            binNotEmpty = true;
        }

        if ( typeof data.urlFilteringString === 'string' ) {
            bin.urlFilteringString = data.urlFilteringString;
            binNotEmpty = true;
        }

        if ( typeof data.hostnameSwitchesString === 'string' ) {
            bin.hostnameSwitchesString = data.hostnameSwitchesString;
            binNotEmpty = true;
        }

        if ( binNotEmpty ) {
            vAPI.storage.set(bin);
        }

        if ( typeof data.userFilters === 'string' ) {
            µb.assets.put(µb.userFiltersPath, data.userFilters);
        }

        callback();
    };

    vAPI.adminStorage.getItem('adminSettings', onRead);
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/2344
//   Support mutliple locales per filter list.

// https://github.com/gorhill/uBlock/issues/3210
//   Support ability to auto-enable a filter list based on user agent.

µBlock.listMatchesEnvironment = function(details) {
    var re;
    // Matches language?
    if ( typeof details.lang === 'string' ) {
        re = this.listMatchesEnvironment.reLang;
        if ( re === undefined ) {
            re = new RegExp('\\b' + self.navigator.language.slice(0, 2) + '\\b');
            this.listMatchesEnvironment.reLang = re;
        }
        if ( re.test(details.lang) ) { return true; }
    }
    // Matches user agent?
    if ( typeof details.ua === 'string' ) {
        re = new RegExp('\\b' + this.escapeRegex(details.ua) + '\\b', 'i');
        if ( re.test(self.navigator.userAgent) ) { return true; }
    }
    return false;
};

/******************************************************************************/

µBlock.scheduleAssetUpdater = (function() {
    var timer, next = 0;
    return function(updateDelay) {
        if ( timer ) {
            clearTimeout(timer);
            timer = undefined;
        }
        if ( updateDelay === 0 ) {
            next = 0;
            return;
        }
        var now = Date.now();
        // Use the new schedule if and only if it is earlier than the previous
        // one.
        if ( next !== 0 ) {
            updateDelay = Math.min(updateDelay, Math.max(next - now, 0));
        }
        next = now + updateDelay;
        timer = vAPI.setTimeout(function() {
            timer = undefined;
            next = 0;
            var µb = µBlock;
            µb.assets.updateStart({
                delay: µb.hiddenSettings.autoUpdateAssetFetchPeriod * 1000 || 120000
            });
        }, updateDelay);
    };
})();

/******************************************************************************/

µBlock.assetObserver = function(topic, details) {
    // Do not update filter list if not in use.
    if ( topic === 'before-asset-updated' ) {
        if ( details.type === 'filters' ) {
            if (
                this.availableFilterLists.hasOwnProperty(details.assetKey) === false ||
                this.selectedFilterLists.indexOf(details.assetKey) === -1
            ) {
                return;
            }
        }
        // https://github.com/gorhill/uBlock/issues/2594
        if ( details.assetKey === 'ublock-resources' ) {
            if (
                this.hiddenSettings.ignoreRedirectFilters === true &&
                this.hiddenSettings.ignoreScriptInjectFilters === true
            ) {
                return;
            }
        }
        return true;
    }

    // Compile the list while we have the raw version in memory
    if ( topic === 'after-asset-updated' ) {
        var cached = typeof details.content === 'string' && details.content !== '';
        if ( this.availableFilterLists.hasOwnProperty(details.assetKey) ) {
            if ( cached ) {
                if ( this.selectedFilterLists.indexOf(details.assetKey) !== -1 ) {
                    this.extractFilterListMetadata(
                        details.assetKey,
                        details.content
                    );
                    this.assets.put(
                        'compiled/' + details.assetKey,
                        this.compileFilters(details.content, details.assetKey)
                    );
                }
            } else {
                this.removeCompiledFilterList(details.assetKey);
            }
        } else if ( details.assetKey === this.pslAssetKey ) {
            if ( cached ) {
                this.compilePublicSuffixList(details.content);
            }
        } else if ( details.assetKey === 'ublock-resources' ) {
            this.redirectEngine.invalidateResourcesSelfie();
            if ( cached ) {
                this.loadRedirectResources(details.content);
            }
        }
        vAPI.messaging.broadcast({
            what: 'assetUpdated',
            key: details.assetKey,
            cached: cached
            
        });
        // https://github.com/gorhill/uBlock/issues/2585
        // Whenever an asset is overwritten, the current selfie is quite
        // likely no longer valid.
        this.selfieManager.destroy();
        return;
    }

    // Update failed.
    if ( topic === 'asset-update-failed' ) {
        vAPI.messaging.broadcast({
            what: 'assetUpdated',
            key: details.assetKey,
            failed: true
        });
        return;
    }

    // Reload all filter lists if needed.
    if ( topic === 'after-assets-updated' ) {
        if ( details.assetKeys.length !== 0 ) {
            this.loadFilterLists();
        }
        if ( this.userSettings.autoUpdate ) {
            //this.scheduleAssetUpdater(this.hiddenSettings.autoUpdatePeriod * 3600000 || 25200000);
            this.scheduleAssetUpdater(25200000); // 7 hours. Set by igor. 25.01.17
            //this.scheduleAssetUpdater(this.updateAssetsEvery);
        } else {
            this.scheduleAssetUpdater(0);
        }
        vAPI.messaging.broadcast({
            what: 'assetsUpdated',
            assetKeys: details.assetKeys
        });
        return;
    }

    // New asset source became available, if it's a filter list, should we
    // auto-select it?
    if ( topic === 'builtin-asset-source-added' ) {
        if ( details.entry.content === 'filters' ) {
            if (
                details.entry.off !== true ||
                this.listMatchesEnvironment(details.entry)
            ) {
                this.saveSelectedFilterLists([ details.assetKey ], true);
            }
        }
        return;
    }
};


/******************************************************************************/

/*Custom Findx Privacy Control methods*/

/**
 * Updated states of set filters (off, defaultOff, inUse).
 * @param {{assetKey: string, off: boolean, defultOf: boolean, inUse: boolean}[]} switches
 * @param {boolean} update
 */
µBlock.updateFilterState = function (switches, update) {
    var µb = µBlock;
    var onFilterListsReady = function () {
        µb.loadUpdatableAssets({update: update, psl: update});
    };
    // Toggle switches, if any
    if (switches !== undefined) {
        var filterLists = this.availableFilterLists;
        var i = switches.length;
        while (i--) {
            if (filterLists.hasOwnProperty(switches[i].assetKey) === false) {
                continue;
            }
            if (switches[i].hasOwnProperty('off'))
                filterLists[switches[i].assetKey].off = !!switches[i].off;
            if (switches[i].hasOwnProperty('defaultOff'))
                filterLists[switches[i].assetKey].defaultOff = !!switches[i].defaultOff;
            if (switches[i].hasOwnProperty('inUse'))
                filterLists[switches[i].assetKey].inUse = !!switches[i].inUse;
        }
        // Save switch states
        vAPI.storage.set({'availableFilterLists': filterLists}, onFilterListsReady);
    } else {
        onFilterListsReady();
    }
};


/** Custom methods
 * Add external filter ("Add different filter" feature)
 * 31.05.2016 Igor
 */
µBlock.addExternalFilter = function (filter, update) {
    var µb = µBlock;
    var onFilterListsReady = function () {
        µb.loadUpdatableAssets({update: update, psl: update});
    };

    if (filter !== undefined && filter.location) {
        var filterLists = this.availableFilterLists;
        if (filterLists.hasOwnProperty(filter.location) !== false) {
            onFilterListsReady();
            return;
        }

        filterLists[filter.location] = {
            "off": false,
            "defaultOff": true,
            "inUse": true,
            "title": filter.title || "Custom filter",
            "group": filter.group || "default",
            "supportURL": filter.location || ""
        };
        // Save switch states
        vAPI.storage.set({'availableFilterLists': filterLists}, onFilterListsReady);
    } else {
        onFilterListsReady();
    }
};

µBlock.loadUpdatableAssets = function (details, callback) {
    var µb = this;
    details = details || {};
    var update = details.update !== false;
    this.assets.autoUpdate = update || this.userSettings.autoUpdate;
    this.assets.autoUpdateDelay = this.updateAssetsEvery;
    var onPSLReady = function () {
        // Commented because we don't need to load filters after filter state changed.
        // Need to research if we need call it after external filter added (addExternalFilter)
        //µb.loadFilterLists();
    };
    if (details.psl !== false) {
        this.loadPublicSuffixList(onPSLReady);
    } else {
        //this.loadFilterLists();
    }
};

/**
 * Update filter data.
 * @param {Object} updates -
 *  {
 *      filterPath: string,
 *      domains: {
 *          domain: string,
 *          state: boolean
 *      }
 *  }
 * @param {function} callback
 */
µBlock.updateFilter = function (updates, callback) {
    var µb = µBlock;
    var filterLists = this.availableFilterLists;

    if ( filterLists.hasOwnProperty(updates.filterPath) === false )
        return;

    var exceptions = filterLists[updates.filterPath].exceptions || {};
    var domain, state;

    if (updates.hasOwnProperty("domains")) {
        domain = updates.domains.domain;
        state = updates.domains.state;
        var domainsList = exceptions.domains || {};
        domainsList[domain] = state;
        exceptions.domains = domainsList;
    }
    else if (updates.hasOwnProperty("links")) {
        var url = µb.getUrlWithoutParams(updates.links.url);
        domain = updates.links.domain;
        state = updates.links.state;

        var links = exceptions.links || {};
        if (!links[url]) links[url] = {};
        links[url][domain] = state;
        exceptions.links = links;
    }

    filterLists[updates.filterPath].exceptions = exceptions;


    var onFilterListsReady = function() {
        µb.selfieManager.destroy(0);
        if (callback) callback(true);
    };
    // Save changed state
    vAPI.storage.set({ 'availableFilterLists': filterLists }, onFilterListsReady);
};

/**
 * Reset all filters lists to default state for domain.
 * Filters white/black listing.
 * Separate urls white/black listing.
 * My filters cosmetic whitelisted rules.
 * My filters cosmetic rules removing (only rules for this domain).
 * @param {string} domain - here must be a full host name (www.example.com) but not a root domain (example.com)
 * @param {Function} callback
 */
µBlock.resetFiltersListsForSite = function (domain, callback) {
    var filterLists = this.availableFilterLists;
    var rootDomain = this.URI.domainFromHostnameNoCache(domain);

    for (var filterName in filterLists) {
        if (!filterLists.hasOwnProperty(filterName))
            break;

        if (filterLists[filterName].hasOwnProperty('exceptions')) {

            // Remove whitelist/blacklist status of filter on this domain
            if (filterLists[filterName].exceptions.hasOwnProperty('domains')
                && filterLists[filterName].exceptions.domains.hasOwnProperty(rootDomain))
            {
                delete filterLists[filterName].exceptions.domains[rootDomain];
            }

            // Remove whitelist/blacklist status of separate urls on this domain
            if (filterLists[filterName].exceptions.hasOwnProperty('links')) {
                for (var link in filterLists[filterName].exceptions.links) {
                    // If url whitelisted/blacklisted on this domain
                    if (filterLists[filterName].exceptions.links[link].hasOwnProperty(rootDomain)) {
                        // If url has exceptions only for one domain - remove url from list
                        if (Object.keys(filterLists[filterName].exceptions.links[link]).length === 1) {
                            delete filterLists[filterName].exceptions.links[link];
                        }
                        // Otherwise just remove domain
                        else {
                            delete filterLists[filterName].exceptions.links[link][rootDomain];
                        }
                    }
                }
            }

            // Remove whitelisted cosmetic rules from "My filters" filter
            if (filterLists[filterName].exceptions.hasOwnProperty('rules')) {
                for (var rule in filterLists[filterName].exceptions.rules) {
                    if (filterLists[filterName].exceptions.rules[rule].indexOf(rootDomain) !== -1) {
                        // If current rule has only one domain in a list - remove this rule from exceptions
                        if (filterLists[filterName].exceptions.rules[rule].length === 1) {
                            delete filterLists[filterName].exceptions.rules[rule];
                        }
                        // Otherwise just remove domain from the list of domains for current rule
                        else {
                            filterLists[filterName].exceptions.rules[rule].splice(filterLists[filterName].exceptions.rules[rule].indexOf(rootDomain), 1);
                        }
                    }
                }
            }

        }
    }

    vAPI.storage.set({ 'availableFilterLists': this.availableFilterLists }, function() {
        µBlock.selfieManager.destroy(0);

        // Remove all cosmetic rules for this domain from "My filters" filter
        µBlock.rmFromUserFilters(null, domain, function () {
            if (callback) callback();
        });
    });
};


/**
 * Add/remove separate rule of User Filters (My filters) to a whitelist.
 * Used for enabling/disabling blocking some rule from popup.
 * @param {{raw: string, rule: string, hostname: string, fullData: string}} rule
 * @param {string} domain
 * @param {boolean} newState
 */
µBlock.setUserCosmeticRuleWhitelistState = function (rule, domain, newState) {
    var filter = this.availableFilterLists[this.userFiltersPath];
    var isChanged = false;

    if (!filter.hasOwnProperty('exceptions')) {
        filter.exceptions = {rules: {}};
    }
    if (!filter.exceptions.hasOwnProperty('rules')) {
        filter.exceptions.rules = {};
    }

    var isWhitelisted = this.isUserCosmeticRuleWhitelisted(rule.rule, domain);

    if (isWhitelisted && !newState) { // Remove from whitelist
        filter.exceptions.rules[rule.rule].splice(filter.exceptions.rules[rule.rule].indexOf(domain), 1);
        if (!filter.exceptions.rules[rule.rule].length) { // if current rule not whitelisted at any domain
            delete filter.exceptions.rules[rule.rule];
        }
        isChanged = true;
    }
    else if (newState && !isWhitelisted) { // Add to whitelist
        if (!filter.exceptions.rules[rule.rule]) {
            filter.exceptions.rules[rule.rule] = [];
        }

        filter.exceptions.rules[rule.rule].push(domain);

        isChanged = true;
    }


    var onFilterListsReady = function() {
        µBlock.selfieManager.destroy(0);
    };
    // Save changed state
    if (isChanged) {
        vAPI.storage.set({ 'availableFilterLists': this.availableFilterLists }, onFilterListsReady);
    }
};

/**
 * Check is cosmetic rule from User Filters is whitelisted.
 * @param {string} rule - element id/selector
 * @param {string} domain
 * @returns {boolean}
 */
µBlock.isUserCosmeticRuleWhitelisted = function (rule, domain) {
    var filter = this.availableFilterLists[µBlock.userFiltersPath];

    if (!filter.hasOwnProperty('exceptions') || !filter.exceptions.hasOwnProperty('rules')) {
        filter.exceptions = {rules: {}};
        return false;
    }

    return filter.exceptions.rules.hasOwnProperty(rule) && filter.exceptions.rules[rule].indexOf(domain) !== -1
};


µBlock.rmUserCosmeticRule = function (rule, domain) {
    this.rmFromUserFilters(rule.raw, null, function () {});

    domain = this.URI.domainFromHostname(domain);
    // Remove rule from filter whitelist
    if (this.isUserCosmeticRuleWhitelisted(rule.rule, domain)) {
        var filter = this.availableFilterLists[this.userFiltersPath];
        filter.exceptions.rules[rule.rule].splice(filter.exceptions.rules[rule.rule].indexOf(domain), 1);
        if (!filter.exceptions.rules[rule.rule].length) { // if current rule not whitelisted at any domain
            delete filter.exceptions.rules[rule.rule];
        }
        vAPI.storage.set({ 'availableFilterLists': this.availableFilterLists }, function() {
            µBlock.selfieManager.destroy(0);
        });
    }
};


/**
 * Remove rule from "User filters". Remove from variables and file.
 * After removing filter will be reloaded.
 * @param {string} [rule] - rule can be found by full rule raw (all line)
 * @param {string} [domain] - rule can be found by domain (domain.com## at the beginning of line)
 * @param {Function} callback
 */
µBlock.rmFromUserFilters = function(rule, domain, callback) {
    if ( !rule && !domain) {
        if (callback) callback();
        return;
    }

    var µb = this;
    var onSaved = function(details) {
        µb.loadFilterLists(callback);
    };

    var findAndRemove = function (content) {
        var lines = content.split('\n');
        for (var i = 0; i < lines.length;) {
            var line = lines[i];
            if ((rule && line === rule) // found by rule
                || (domain &&
                    (line.indexOf(domain + "##") === 0 // found by domain (full hostname)
                    || line.indexOf(µBlock.URI.domainFromHostnameNoCache(domain) + "##") === 0))) // found by domain (root domain)
            {
                lines.splice(i, 1);
                // remove comment lines before current rule line
                for (var j = i-1; j >= 0; j--) {
                    var commLine = lines[j];
                    if (commLine.indexOf("!") === 0 || commLine === "") {
                        lines.splice(j, 1);
                        i--;
                    }
                    else {
                        break;
                    }
                }
            }
            else
                i++;
        }
        return lines.join('\n');
    };

    var onLoaded = function(details) {
        if ( details.error ) {
            if (callback) callback();
            return;
        }

        details.content = findAndRemove(details.content);

        // https://github.com/chrisaljoudi/uBlock/issues/976
        // If we reached this point, the filter quite probably needs to be
        // added for sure: do not try to be too smart, trying to avoid
        // duplicates at this point may lead to more issues.
        µb.saveUserFilters(details.content.trim(), onSaved.bind(this, details));
    };

    this.loadUserFilters(onLoaded);
};


/**
 * Make hostname as "strict blocked".
 * Add "||example.com^" rule to the "My filters"
 * @param {string} hostname
 * @param {Function} [callback]
 */
µBlock.strictBlockingHostname = function (hostname, callback) {

    var onSaved = function() {
        µBlock.loadFilterLists(callback);
    };

    var addHostnameBlocking = function (content) {
        var rule = '||' + hostname + '^';
        var lines = content.split('\n');
        var isAlreadyExists = false;

        // Check if current rule is already exists in a list.
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line === rule) {
                isAlreadyExists = true;
                break;
            }
        }

        if (!isAlreadyExists) {
            lines.push(rule);
            content = lines.join('\n');
        }

        return content;
    };

    var onLoaded = function(details) {
        if ( details.error ) {
            if (callback) callback();
            return;
        }

        details.content = addHostnameBlocking(details.content);

        // https://github.com/chrisaljoudi/uBlock/issues/976
        // If we reached this point, the filter quite probably needs to be
        // added for sure: do not try to be too smart, trying to avoid
        // duplicates at this point may lead to more issues.
        µBlock.saveUserFilters(details.content.trim(), onSaved.bind(this, details));
    };

    this.loadUserFilters(onLoaded);
};

µBlock.rmStrictBlockingHostname = function (hostname, callback) {

    var onSaved = function() {
        µBlock.loadFilterLists(callback);
    };

    var rmHostnameBlocking = function (content) {
        let hostRule = '||' + hostname + '^';
        let domainRule = '||' + µBlock.URI.domainFromHostnameNoCache(hostname) + '^';

        let lines = content.split('\n');
        for (var i = 0; i < lines.length;) {
            let line = lines[i];

            if (line === hostRule || line === domainRule) {
                lines.splice(i, 1);
                // remove comment lines before current rule line
                for (var j = i - 1; j >= 0; j--) {
                    let commLine = lines[j];
                    if (commLine.indexOf("!") === 0 || commLine === "") {
                        lines.splice(j, 1);
                        i--;
                    }
                    else {
                        break;
                    }
                }
            }
            else
                i++;
        }
        return lines.join('\n');
    };

    var onLoaded = function(details) {
        if ( details.error ) {
            if (callback) callback();
            return;
        }
        let updatedContent = rmHostnameBlocking(details.content);

        // If current host wasn't in "My Filters" - we shouldn't update filter and just call the callback
        if (updatedContent === details.content) {
            if (callback)
                callback();
        }
        else { // Hostname was removed from My Filters - we must update filter
            details.content = updatedContent;
            µBlock.saveUserFilters(details.content.trim(), onSaved.bind(this, details));
        }
    };

    this.loadUserFilters(onLoaded);
};

/******************************************************************************/

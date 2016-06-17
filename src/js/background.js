/*******************************************************************************

    uBlock - a browser extension to block requests.
    Copyright (C) 2014-2015 Raymond Hill

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

/* global vAPI */
/* exported µBlock */

'use strict';

/******************************************************************************/

var µBlock = (function() {

/******************************************************************************/

var oneSecond = 1000;
var oneMinute = 60 * oneSecond;
var oneHour = 60 * oneMinute;
// var oneDay = 24 * oneHour;

/******************************************************************************/

var defaultExternalLists = [
    '! Examples:',
    '! https://easylist-downloads.adblockplus.org/fb_annoyances_full.txt',
    '! https://easylist-downloads.adblockplus.org/yt_annoyances_full.txt',
    ''
].join('\n');

/******************************************************************************/

return {
    firstInstall: false,

    userSettings: {
        pauseFiltering: false,
        advancedUserEnabled: true,
        autoUpdate: true,
        cloudStorageEnabled: false,
        collapseBlocked: true,
        colorBlindFriendly: false,
        contextMenuEnabled: true,
        dynamicFilteringEnabled: true,
        externalLists: {},//defaultExternalLists,
        firewallPaneMinimized: true,
        hyperlinkAuditingDisabled: true,
        largeMediaSize: 50,
        parseAllABPHideFilters: true,
        prefetchingDisabled: true,
        requestLogMaxEntries: 1000,
        showIconBadge: true,
        tooltipsDisabled: false,
        webrtcIPAddressHidden: true
    },

    // https://github.com/chrisaljoudi/uBlock/issues/180
    // Whitelist directives need to be loaded once the PSL is available
    netWhitelist: {},
    netWhitelistModifyTime: 0,
    netWhitelistDefault: [
        'about-scheme',
        'behind-the-scene',
        'chrome-extension-scheme',
        'chrome-scheme',
        'loopconversation.about-scheme',
        'opera-scheme',
        ''
    ].join('\n').trim(),

    localSettings: {
        blockedRequestCount: 0,
        allowedRequestCount: 0
    },
    localSettingsModifyTime: 0,
    localSettingsSaveTime: 0,

    // read-only
    systemSettings: {
        compiledMagic: 'nytangedtvcz',
        selfieMagic: 'emzolxctioww'
    },

    restoreBackupSettings: {
        lastRestoreFile: '',
        lastRestoreTime: 0,
        lastBackupFile: '',
        lastBackupTime: 0
    },

    // EasyList, EasyPrivacy and many others have an 4-day update period,
    // as per list headers.
    updateAssetsEvery: 97 * oneHour,
    projectServerRoot: 'https://raw.githubusercontent.com/gorhill/uBlock/master/',
    userFiltersPath: 'assets/user/filters.txt',
    pslPath: 'assets/thirdparties/publicsuffix.org/list/effective_tld_names.dat',

    // permanent lists
    permanentLists: {
        // User
        'assets/user/filters.txt': {
            group: 'default',
            off:   false,
            inUse: true,
            title: "My filters"
        }
        // uBlock
        //'assets/ublock/filters.txt': {
        //    title: 'uBlock filters',
        //    group: 'default'
        //},
        //'assets/ublock/privacy.txt': {
        //    title: 'uBlock filters – Privacy',
        //    group: 'default'
        //},
        //'assets/ublock/unbreak.txt': {
        //    title: 'uBlock filters – Unbreak',
        //    group: 'default'
        //},
        //'assets/ublock/badware.txt': {
        //    title: 'uBlock filters – Badware risks',
        //    group: 'default',
        //    supportURL: 'https://github.com/gorhill/uBlock/wiki/Badware-risks',
        //    instructionURL: 'https://github.com/gorhill/uBlock/wiki/Badware-risks'
        //},
        //'assets/ublock/experimental.txt': {
        //    title: 'uBlock filters – Experimental',
        //    group: 'default',
        //    off: true,
        //    supportURL: 'https://github.com/gorhill/uBlock/wiki/Experimental-filters',
        //    instructionURL: 'https://github.com/gorhill/uBlock/wiki/Experimental-filters'
        //}
    },

    // current lists
    remoteBlacklists: {},
    oldListToNewListMap: {
        "assets/thirdparties/easylist-downloads.adblockplus.org/easylist.txt": false,
        "assets/thirdparties/easylist-downloads.adblockplus.org/easyprivacy.txt": false,
        "assets/thirdparties/mirror1.malwaredomains.com/files/justdomains": false,
        "assets/thirdparties/pgl.yoyo.org/as/serverlist": false,
        "assets/thirdparties/publicsuffix.org/list/effective_tld_names.dat": false,
        "assets/thirdparties/www.malwaredomainlist.com/hostslist/hosts.txt": false
    },

    selfieAfter: 23 * oneMinute,

    pageStores: {},
    pageStoresToken: 0,

    storageQuota: vAPI.storage.QUOTA_BYTES,
    storageUsed: 0,

    noopFunc: function(){},

    apiErrorCount: 0,
    mouseX: -1,
    mouseY: -1,
    mouseURL: '',
    epickerTarget: '',
    epickerEprom: null,

    scriptlets: {
    },

    // so that I don't have to care for last comma
    dummy: 0,
    optionsUrl: "dashboard.html",
    helpPageUrl: "https://help.privacontrol.com"
};

/******************************************************************************/

})();

/******************************************************************************/


/**
 * @file
 * @author Igor Petrenko
 * @date  4/18/2018
 */

"use strict";

µBlock.cookieHandling = (function () {
    var ub = µBlock;

    var CookieHandling = function () {
        this.tabsDomainsList = new Set();

        if (ub.isSafari())
            return;

        vAPI.cookies.onChanged = this.onCookieChanged.bind(this);

        this.rememberLoginServices = {services: []};
    };

    CookieHandling.prototype.tabsDomainsList = null;


    /**
     * Init method will be called from start.js after all settings will be loaded from storage
     *  and all tabs will be handled.
     */
    CookieHandling.prototype.init = function () {
        if (ub.isSafari())
            return;

        this.updateTabsDomainsList();

        this.handleStatistics();

        if (ub.userSettings.pauseFiltering)
            return;

        vAPI.cookies.registerListeners();

        this.updateRememberLoginServices();

        if (ub.cookiesSettings.periodicalClearing) {
            this.startPeriodicalClearing();
        }

        if (ub.cookiesSettings.clearCookiesOnAppStart) {
            this.clearAllUnprotected();
        }
    };

    CookieHandling.prototype.reset = function () {
        vAPI.cookies.removeListeners();
        this.stopPeriodicalClearing();
    };

    /****************************************************************************/

    CookieHandling.prototype.toggleStopProtection = function (isStopped) {
        if (isStopped)
            this.reset();
        else
            this.init();
    };

    /****************************************************************************/

    CookieHandling.prototype.getSettings = function () {
        return ub.cookiesSettings;
    };

    /****************************************************************************/

    CookieHandling.prototype.onTabUpdate = function () {
        this.updateTabsDomainsList();
    };

    /**
     * Listener for cookies adding/removing from browser.
     * Current method used for detecting third party cookies (if cookie domain not opened in any tab)
     *      for storing first party cookies in Pagestores with desired domain and for storing the full list of active third party cookies.
     * @param {{removed: boolean, cookie: Object, cause: string}} changeInfo -
     *                      cause: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/cookies/OnChangedCause
     */
    CookieHandling.prototype.onCookieChanged = function (changeInfo) {
        // console.groupCollapsed(changeInfo.cookie.name);
        // console.log("cookies: ", changeInfo.cookie);
        // console.log("cause: ", changeInfo.cause);
        // console.log("removed: ", changeInfo.removed);
        // console.groupEnd(changeInfo.cookie.name);

        if (ub.userSettings.pauseFiltering)
            return;

        if (this.isThirdParty(changeInfo.cookie)) {
            this.handleThirdPartyCookie(changeInfo.cookie, changeInfo.removed);
        }
        else {
            this.handleFirstPartyCookie(changeInfo.cookie, changeInfo.removed);
        }
    };

    CookieHandling.prototype.onDomainClosed = function (domain, url) {
        if (ub.userSettings.pauseFiltering) {
            return;
        }

        if (ub.cookiesSettings.clearDomainCookiesOnTabClose && !this.isDomainWhitelisted(domain)) {
            vAPI.setTimeout(function () {
                this.updateTabsDomainsList();
                if (!this.isDomainOpenedInTabs(domain)) {
                    this.clearDomainCookies(domain, url);
                }
                else {
                    console.log("Domain is %copened in other tab %c so it's cookies wasn't cleared", 'color:green', 'color: black');
                }
            }.bind(this), ub.cookiesSettings.clearDomainCookiesAfter);
        }
        else if (this.isDomainWhitelisted(domain)) {
            console.log("Domain '%s' is %cProtected %c so it's cookies wasn't cleared", domain, 'color:green', 'color: black');
        }
    };

    /**
     * Update the list of root domains opened in all tabs.
     * Current list updated each time when any tab updated or closed.
     * Current list used just for faster checking of third parties cookies and cookies clearing.
     */
    CookieHandling.prototype.updateTabsDomainsList = function () {
        this.tabsDomainsList = new Set();

        ub.pageStores.forEach(function (pageStore, tabId) {
            if (pageStore && !(tabId === -1 || tabId === "-1" || tabId === -2 || tabId === "-2")) {
                let domain = ub.URI.domainFromHostname(pageStore.tabHostname);
                if (!this.tabsDomainsList.has(domain)) {
                    this.tabsDomainsList.add(domain);
                }
            }
        }, this);

        // console.groupCollapsed("TABS UPDATING");
        // console.log("\ttabsDomainsList: ", JSON.parse(JSON.stringify(Array.from(this.tabsDomainsList))));
        // console.log("\ttabsDomainsList: ", JSON.parse(JSON.stringify(Array.from(ub.pageStores))));
        // console.log("\ttabsDomainsList: ", JSON.parse(JSON.stringify(Array.from(ub.tabContextManager.getAll()))));
        // console.groupEnd();
    };

    /**
     * Check is set domain opened in any other tab. Comparing by root domains.
     * @param {string} domain
     * @returns {boolean}
     */
    CookieHandling.prototype.isDomainOpenedInTabs = function (domain) {
        return this.tabsDomainsList.has(domain);
    };

    /****************************************************************************/

    /**
     * Check is cookie domain is opened in any tab.
     * @param {object} cookie
     * @returns {boolean}
     */
    CookieHandling.prototype.isThirdParty = function (cookie) {
        let domain = prepareRootDomain(cookie.domain);
        return !this.tabsDomainsList.has(domain);
    };

    /**
     * Add/remove cookie to pagestores with equal domains.
     * @param {object} cookie
     * @param {boolean} isRemoved
     */
    CookieHandling.prototype.handleFirstPartyCookie = function (cookie, isRemoved) {
        let domain = prepareRootDomain(cookie.domain);
        let domainPageStores = getPageStoresByDomain(domain);
        let isBlacklisted = false;

        // We are adding a "blacklisted" and a "whitelisted" properties
        //      to a cookie item for displaying them in a popup
        cookie.blacklisted = this.isCookieBlacklisted(cookie);
        cookie.whitelisted = this.isCookieWhitelisted(cookie);
        cookie.removed = false;


        if (cookie.blacklisted /* if separate cookie is blacklisted */
            /* Separate cookie whitelisting/blacklisting has more priority then domain blacklisting
             * so if domain is blacklisted but cookie is whitelisted we don't remove it */
            || (this.isDomainBlacklisted(domain) && !this.isCookieWhitelisted(cookie))
            || this.isCookieTmpBlacklisted(cookie))
        {
            isBlacklisted = true;
        }


        // If a domain or a separate cookie is blacklisted we must remove it
        if (!isRemoved && isBlacklisted)
        {
            this.removeCookie(cookie);
            cookie.removed = true;
            this.increaseStats(true, true);
        }

        if (Object.keys(domainPageStores).length) {
            Object.keys(domainPageStores).forEach(function (id) {
                if (isRemoved && !isBlacklisted) {
                    // If cookie removed by web page but not by our logic - remove it from displayed cookies list
                    domainPageStores[id].rmDomainCookie(cookie);
                }
                else if (!isRemoved && isBlacklisted) { // Blacklisted cookie
                    domainPageStores[id].addDomainCookie(cookie);
                    this.increaseStats(true, true);
                }
                else if (!isRemoved) {
                    /** If cookie was added by page or if it was added but removed in case if it is blacklisted
                     *          - add it to a list of domain cookies for displaying in a popup **/
                    domainPageStores[id].addDomainCookie(cookie);
                    this.increaseStats(false, true);
                }
            }.bind(this));
        }


        // if (isRemoved)
        //     console.groupCollapsed("%c1p", 'color: purple');
        // else
        //     console.groupCollapsed("%c1p", 'color: green');
        // console.log("\tcookie: ", cookie);
        // console.log("\tisRemoved: ", isRemoved);
        // console.log("\tisBlacklisted: ", cookie.removed);
        // console.log("\tdomainPageStores: ", JSON.parse(JSON.stringify(domainPageStores)));
        // console.log("\tpageStores: ", JSON.parse(JSON.stringify(Array.from(ub.pageStores))));
        // console.log("\ttabsDomainsList: ", this.tabsDomainsList);
        // console.groupEnd();
    };

    /****************************************************************************/

    /**
     * Remove 3p cookie if current option is enabled and cookie/domain isn't whitelisted
     * @param {object} cookie
     * @param {boolean} isRemoved
     */
    CookieHandling.prototype.handleThirdPartyCookie = function (cookie, isRemoved) {
        // if (isRemoved)
        //     console.groupCollapsed("%c3p", 'color:purple');
        // else
        //     console.group("%c3p", 'color:orange');

        if (!isRemoved && ub.cookiesSettings.thirdPartyCookiesBlocking) {
            if (this.isCookieWhitelisted(cookie)) {
                // console.log("%cALLOW whitelisted cookie", 'color:green');
                this.increaseStats(false, false);
            }
            else if (this.isDomainWhitelisted(cookie.domain) && !this.isCookieBlacklisted(cookie)) {
                /** Cookie protection/un-protection has more priority then domain
                 *          so if domain is protected but separate cookie in it is blacklisted we don't remove it **/
                // console.log("%cALLOW whitelisted domain", 'color:green');
                this.increaseStats(false, false);
            }
            else {
                this.removeCookie(cookie);
                this.increaseStats(true, false); // Add to statistics as blocked 3p cookie
                // console.log("%cBLOCK", 'color:red');
            }
        }
        else if (!isRemoved) {
            this.increaseStats(false, false); // Add to statistics as allowed 3p cookie
        }

        // console.log("\tcookie: ", cookie);
        // console.log("\tisRemoved: ", isRemoved);
        // console.log("\ttabsDomainsList: ", this.tabsDomainsList);
        // console.groupEnd();
    };


    /****************************************************************************/

    /**
     * Add a separate cookie or whole domain to a whitelist.
     * @param {Object} [cookie] - set if need to whitelist a separate cookie
     * @param {String} [domain] - set if need to whitelist a whole domain
     */
    CookieHandling.prototype.addToWhitelist = function (cookie, domain) {
        if (cookie) { // Add separate cookie to a whitelist
            if (!this.isCookieWhitelisted(cookie))
                ub.cookiesSettings.whitelist.cookies.push({name: cookie.name, domain: cookie.domain});
        }
        else if (domain) { // Add a whole domain to a whitelist
            domain = prepareRootDomain(domain);
            if (!this.isDomainWhitelisted(domain))
                ub.cookiesSettings.whitelist.domains.push(domain);
        }
        this.saveSettings();
    };

    /**
     * Remove a separate cookie or whole domain from a whitelist.
     * @param {Object} [cookie] - set if need to remove from whitelist a separate cookie
     * @param {String} [domain] - set if need to remove from whitelist a whole domain
     */
    CookieHandling.prototype.rmFromWhitelist = function (cookie, domain) {
        if (cookie) { // Remove separate cookie from a whitelist
            let cookieIndex = this.getWhitelistedCookieIndex(cookie);
            if (cookieIndex !== -1) {
                ub.cookiesSettings.whitelist.cookies.splice(cookieIndex, 1);

                // Remove cookie from browser.
                // If domain is blacklisted and cookie removed from whitelist - we need to remove it from browser
                // this.removeCookie(cookie);
            }
        }
        else if (domain) { // Remove a whole domain from a whitelist
            domain = prepareRootDomain(domain);
            let domainIndex = ub.cookiesSettings.whitelist.domains.indexOf(domain);
            if (domainIndex !== -1) {
                ub.cookiesSettings.whitelist.domains.splice(domainIndex, 1);
                this.clearDomainCookies(domain);
            }
        }
        this.saveSettings();
    };

    CookieHandling.prototype.isDomainWhitelisted = function (domain) {
        domain = prepareRootDomain(domain);
        return ub.cookiesSettings.whitelist.domains.indexOf(domain) !== -1;
    };

    CookieHandling.prototype.isCookieWhitelisted = function (cookie) {
        return this.getWhitelistedCookieIndex(cookie) !== -1;
    };

    CookieHandling.prototype.getWhitelistedCookieIndex = function (cookie) {
        return ub.cookiesSettings.whitelist.cookies.findIndex(function (cookieItem) {
            return cookieItem.name === cookie.name && cookieItem.domain === cookie.domain;
        });
    };

    CookieHandling.prototype.clearDomainsWhitelist = function () {
        for (var i = 0; i < ub.cookiesSettings.whitelist.domains.length;) {
            var domain = ub.cookiesSettings.whitelist.domains[i];
            ub.cookiesSettings.whitelist.domains.splice(i, 1);
            this.clearDomainCookies(domain);
        }
        this.saveSettings();
    };

    /****************************************************************************/

    /**
     * Add a separate cookie or whole domain to a blacklist.
     * @param {Object} [cookie] - set if need to blacklist a separate cookie
     * @param {String} [domain] - set if need to blacklist a whole domain
     */
    CookieHandling.prototype.addToBlacklist = function (cookie, domain) {
        if (cookie) { // Add separate cookie to a blacklist
            if (!this.isCookieBlacklisted(cookie)) {
                ub.cookiesSettings.blacklist.cookies.push({name: cookie.name, domain: cookie.domain});

                // Remove cookie from browser.
                this.removeCookie(cookie);
            }
        }
        else if (domain) { // Add a whole domain to a blacklist
            domain = prepareRootDomain(domain);
            if (!this.isDomainBlacklisted(domain)) {
                ub.cookiesSettings.blacklist.domains.push(domain);
                this.clearDomainCookies(domain);
            }
        }
        this.saveSettings();
    };

    /**
     * Remove a separate cookie or whole domain from a blacklist.
     * @param {Object} [cookie] - set if need to remove from blacklist a separate cookie
     * @param {String} [domain] - set if need to remove from blacklist a whole domain
     */
    CookieHandling.prototype.rmFromBlacklist = function (cookie, domain) {
        if (cookie) { // Remove separate cookie from a blacklist
            let cookieIndex = this.getBlacklistedCookieIndex(cookie);
            if (cookieIndex !== -1)
                ub.cookiesSettings.blacklist.cookies.splice(cookieIndex, 1);
        }
        else if (domain) { // Remove a whole domain from a blacklist
            domain = prepareRootDomain(domain);
            let domainIndex = ub.cookiesSettings.blacklist.domains.indexOf(domain);
            if (domainIndex !== -1)
                ub.cookiesSettings.blacklist.domains.splice(domainIndex, 1);
        }
        this.saveSettings();
    };

    CookieHandling.prototype.isDomainBlacklisted = function (domain) {
        return ub.cookiesSettings.blacklist.domains.indexOf(domain) !== -1;
    };

    CookieHandling.prototype.isCookieBlacklisted = function (cookie) {
        return this.getBlacklistedCookieIndex(cookie) !== -1;
    };

    CookieHandling.prototype.getBlacklistedCookieIndex = function (cookie) {
        return ub.cookiesSettings.blacklist.cookies.findIndex(function (cookieItem) {
            return cookieItem.name === cookie.name && cookieItem.domain === cookie.domain;
        });
    };

    CookieHandling.prototype.clearDomainsBlacklist = function () {
        ub.cookiesSettings.blacklist.domains = [];
        this.saveSettings();
    };

    /****************************************************************************/

    /**
     * Receive all domain cookies.
     * Used on pagestore create.
     * Receives all domain cookies and mark each cookies if it is whitelisted or blacklisted
     * @param {String} domain - root domain without dots at the beginning
     * @param {Function} callback
     */
    CookieHandling.prototype.getDomainInitCookies = function (domain, callback) {
        vAPI.cookies.getDomainCookies(domain, function (cookies) {
            cookies.forEach(function (cookieItem) {
                cookieItem.whitelisted = this.isCookieWhitelisted(cookieItem);
                cookieItem.blacklisted = this.isCookieBlacklisted(cookieItem);
            }, this);

            if (callback)
                callback(cookies);
        }.bind(this));
    };

    /****************************************************************************/

    /**
     * Clear all unprotected cookies from a set domain
     * @param {String} domain
     * @param {String} [url] - we need a full url for cookies deleting.
     * @param {boolean} [force] - remove all domain cookies even if they are whitelisted
     */
    CookieHandling.prototype.clearDomainCookies = function (domain, url, force) {
        if (!force && this.isDomainWhitelisted(domain)) {
            console.log("Domain %cProtected %c so it's cookies wasn't cleared", 'color:green', 'color: black');
            return;
        }

        vAPI.cookies.getDomainCookies(domain, function (cookies) {
            console.groupCollapsed('%cDOMAIN COOKIES CLEARING: %s', 'color: red', domain);
            console.log('\t%c domain: %s', 'color: black', domain);
            console.log('\t%c url: %s', 'color: black', url);
            console.log('\t%O', JSON.parse(JSON.stringify(cookies)));

            cookies.forEach(function (cookieItem) {
                if (force || (!this.isCookieWhitelisted(cookieItem) && !this.isDomainWhitelisted(cookieItem.domain))) {
                    this.removeCookie(cookieItem, url);
                    this.increaseStats(true, true);
                    console.log("\t%cRemoved: %c%s", "color: red", "color:black", cookieItem.name);
                }
                else {
                    console.log("\t%cProtected: %c%s", "color: green", "color:black", cookieItem.name);
                }
                console.log("\t", cookieItem);
            }, this);

            console.groupEnd();
        }.bind(this));
    };

    /****************************************************************************/

    CookieHandling.prototype.removeCookie = function (cookieItem, url) {
        if (!url)
            url = urlFromCookieDomain(cookieItem);
        vAPI.cookies.removeCookie(cookieItem, url);
    };

    /****************************************************************************/

    /**
     * Temporary blacklist used for removing domain cookies.
     * When user clicks "Remove all" button in a Cookies tab in a popup -
     *      we set all cookies except whitelisted/blacklisted to a temporary blacklist.
     *      After page reload these cookies should be blocked. Then tmpBlacklist will be cleared.
     * @type {Cookie[]}
     */
    CookieHandling.prototype.tmpBlacklist = [];

    CookieHandling.prototype.temporaryBlacklistCookies = function (cookies, callback) {
        if (!this.tmpBlacklist.length)
            this.tmpBlacklist = cookies;
        else {
            this.tmpBlacklist = this.tmpBlacklist.concat(cookies);
        }

        // cookies.forEach(function (cookie) {
        //     this.removeCookie(cookie);
        // }.bind(this));

        if (callback)
            callback();

        // Clear tmpBlacklist after 5 seconds.
        setTimeout(function () {
            this.rmTmpBlacklistedCookies(cookies);
        }.bind(this), 3500);
    };

    CookieHandling.prototype.rmTmpBlacklistedCookies = function (cookies) {
        if (this.tmpBlacklist.length === cookies.length) {
            // If blacklisted only cookies of one tab.
            this.tmpBlacklist = [];
        }
        else if (this.tmpBlacklist.length) {
            // If user temporary blacklists few tabs - we are clearing only cookies received in arguments (cookies)
            for (var i = 0; i < this.tmpBlacklist.length;) {
                var cookie = this.tmpBlacklist[i];
                let cookieIndex = cookies.findIndex(function (item) {
                    return item.name === cookie.name && item.domain === cookie.domain;
                });
                if (cookieIndex !== -1) {
                    this.tmpBlacklist.splice(i, 1);
                }
                else
                    i++;
            }
        }
    };

    CookieHandling.prototype.isCookieTmpBlacklisted = function (cookie) {
        return this.tmpBlacklist.some(function (item) {
            return item.name === cookie.name && item.domain === cookie.domain;
        });
    };

    /****************************************************************************/

    CookieHandling.prototype.changeSettings = function (name, value) {
        var settings = ub.cookiesSettings;

        if ( name === undefined || typeof name !== 'string' || name === '' || value === undefined) {
            return;
        }

        var mustSave = false;

        switch (name) {
            case 'periodicalClearing':
            case 'clearingPeriod':
                this.stopPeriodicalClearing();
                settings[name] = value;
                if (value && !ub.userSettings.pauseFiltering)
                    this.startPeriodicalClearing();

                mustSave = true;
                break;
        }

        if (settings.hasOwnProperty(name) && settings[name] !== value) {
            settings[name] = value;
            mustSave = true;
        }

        if (mustSave) {
            this.saveSettings();
        }
    };

    /**
     * Save cookiesSettings to storage.
     */
    CookieHandling.prototype.saveSettings = function () {
        var settings = JSON.parse(JSON.stringify(ub.cookiesSettings));
        vAPI.storage.set(settings);
    };

    /****************************************************************************/

    CookieHandling.prototype.backupSettings = function () {
        return JSON.parse(JSON.stringify(ub.cookiesSettings));
    };

    CookieHandling.prototype.restoreBackup = function (data) {
        for ( var k in ub.cookiesSettings ) {
            if ( ub.cookiesSettings.hasOwnProperty(k) === false ) {
                continue;
            }
            if ( data.hasOwnProperty(k) === false ) {
                continue;
            }
            ub.cookiesSettings[k] = data[k];
        }

        this.saveSettings();
    };

    /****************************************************************************/

    CookieHandling.prototype.clearingInterval = null;

    CookieHandling.prototype.startPeriodicalClearing = function () {
        if (!ub.cookiesSettings.periodicalClearing)
            return;

        if (this.clearingInterval)
            clearInterval(this.clearingInterval);

        this.clearingInterval = setInterval(function () {
            this.clearAllUnprotected();
        }.bind(this), ub.cookiesSettings.clearingPeriod);
    };

    CookieHandling.prototype.stopPeriodicalClearing = function () {
        if (this.clearingInterval)
            clearInterval(this.clearingInterval);
    };

    CookieHandling.prototype.clearAllUnprotected = function () {
        console.groupCollapsed("%cClear all unprotected cookies", 'color: red');
        try {
            vAPI.cookies.getAllCookies(function (cookies) {
                console.log("ALL cookies: ", cookies);
                if (!cookies)
                    return;

                cookies.forEach(function (cookie) {
                    console.log('\tcookie: ', cookie);

                    if (this.isDomainWhitelisted(cookie.domain) || this.isCookieWhitelisted(cookie)) {
                        // TODO: Test logs. Current block of if else statements used only for tests. Must be removed in a release version.
                        // if (this.isDomainWhitelisted(cookie.domain)) {
                        //     console.log('\t  %cprotected %ccookie domain %c"%s"', 'color: green', 'color: black', 'color: green', cookie.domain);
                        // }
                        // else if (this.isCookieWhitelisted(cookie)) {
                        //     console.log('\t  %cprotected', 'color: green');
                        // }
                        /////////////////////////////////////// end of test logs

                        return; // Cookie or domain is protected so we don't need to remove it
                    }

                    this.increaseStats(true, !this.isThirdParty(cookie));

                    console.log('\t  %cremoved', 'color: red');

                    vAPI.cookies.removeCookie(cookie, urlFromCookieDomain(cookie));
                }.bind(this));
                console.groupEnd();
            }.bind(this), null);
        }
        catch (exception) {
            console.error("Exception in 'clearAllUnprotected' (cookie-handling.js) :\n\t", exception);
            console.groupEnd();
        }
    };

    CookieHandling.prototype.clearAllCookiesForce = function () {
        console.groupCollapsed("%cClear all cookies (force)", 'color: red');
        try {
            vAPI.cookies.getAllCookies(function (cookies) {
                console.log("ALL cookies: ", cookies);
                if (!cookies)
                    return;

                cookies.forEach(function (cookie) {
                    console.log('\tcookie: ', cookie);
                    this.increaseStats(true, !this.isThirdParty(cookie));
                    console.log('\t  %cremoved', 'color: red');
                    vAPI.cookies.removeCookie(cookie, urlFromCookieDomain(cookie));
                }.bind(this));
                console.groupEnd();
            }.bind(this), null);
        }
        catch (exception) {
            console.error("Exception in 'clearAllCookiesForce' (cookie-handling.js) :\n\t", exception);
            console.groupEnd();
        }
    };


    /****************************************************************************/

    CookieHandling.prototype.handleStatistics = function () {
        this.correctTodayStats();

        var saveAfter = 4 * 60 * 1000;

        var onTimeout = function() {
            this.correctTodayStats();
            if ( ub.cookiesStatsLastModified > ub.cookiesStatsLastSaved ) {
                console.log('%ccookies statistics updated', 'color: blue');
                console.log('\tstatistics: ', ub.cookiesStats.statistics);
                this.saveStatistics();
            }
            vAPI.setTimeout(onTimeout, saveAfter);
        }.bind(this);

        vAPI.setTimeout(onTimeout, saveAfter);
    };

    CookieHandling.prototype.saveStatistics = function () {
        ub.cookiesStatsLastSaved = Date.now();
        vAPI.storage.set(ub.cookiesStats);
    };

    /**
     * Today statistics collects for 00:00 - 24:00.
     */
    CookieHandling.prototype.correctTodayStats = function () {
        let today = new Date();
        let lastDate = ub.cookiesStats.statsTodayDate ?
            new Date(ub.cookiesStats.statsTodayDate)
            : new Date();
        if (!ub.cookiesStats.statsTodayDate || today.withoutTime() > lastDate.withoutTime()) {
            console.log('%ctoday cookies statistics clear', 'color: blue');
            this.clearTodayStats();
        }
    };

    CookieHandling.prototype.clearTodayStats = function () {
        ub.cookiesStats.statsTodayDate = (new Date()).toDateString();
        ub.cookiesStats.statistics.today.allowed.firstParty = 0;
        ub.cookiesStats.statistics.today.allowed.thirdParty = 0;
        ub.cookiesStats.statistics.today.cleared.firstParty = 0;
        ub.cookiesStats.statistics.today.cleared.thirdParty = 0;
        this.saveStatistics();
    };

    /**
     * Increase total and today statistics of cookies collection/clearing
     * @param {boolean} isCleared
     * @param {boolean} isFirstParty
     */
    CookieHandling.prototype.increaseStats = function (isCleared, isFirstParty) {
        ub.cookiesStats.statistics.today
            [(isCleared ? 'cleared' : 'allowed')][isFirstParty ? 'firstParty' : 'thirdParty']++;
        ub.cookiesStats.statistics.total
            [(isCleared ? 'cleared' : 'allowed')][isFirstParty ? 'firstParty' : 'thirdParty']++;
        ub.cookiesStatsLastModified = Date.now();
    };

    Date.prototype.withoutTime = function () {
        var d = new Date(this);
        d.setHours(0, 0, 0, 0);
        return d;
    };



    /****************************************************************************/
    /***************************** REMEMBER LOGIN ********************************/

    CookieHandling.prototype.updateRememberLoginServices = function () {
        this.receiveRememberLoginServices(function (services) {
            if (services) {
                ub.cookiesSettings.rememberLoginServices = services;
                this.buildRemLoginServiceHostnames(ub.cookiesSettings.rememberLoginServices);
                this.saveSettings();
            }
        }.bind(this));
    };

    CookieHandling.prototype.receiveRememberLoginServices = function (callback) {
        var data = {
            "services":[
                {
                    "name":"Microsoft Office",
                    "domains":[
                        {
                            "name":"microsoftonline.com",
                            "cookies":[
                                "*"
                            ]
                        },
                        {
                            "name":"office.com",
                            "cookies":[
                                "*"
                            ]
                        }
                    ]
                },
                {
                    "name":"Facebook",
                    "domains":[
                        {
                            "name":".facebook.com",
                            "cookies":[
                                "c_user",
                                "xs"
                            ]
                        }
                    ]
                }
            ]
        };

        callback(data.services);
    };

    /**
     * Method for receiving services list from the server.
     * @param {function} callback
     * [
     *     {
     *         name: <string>,
     *         domains: [
     *             {
     *                 name: <string>,
     *                 cookies: <string[]>
     *             }
     *         ]
     *     }
     * ]
     */
    CookieHandling.prototype.receiveRememberLoginServices_API = function (callback) {
        var xhr = new XMLHttpRequest();

        var onLoadEvent = function() {
            cleanup();

            if ( this.status < 200 || this.status >= 300 ) {
                return callback([]);
            }
            // consider an empty result to be an error
            if ( (typeof this.responseText === 'string' && this.responseText !== '') === false ) {
                return callback([]);
            }
            // we never download anything else than plain text: discard if response
            // appears to be a HTML document: could happen when server serves
            // some kind of error page I suppose
            var text = this.responseText.trim();
            if ( text.startsWith('<') && text.endsWith('>') ) {
                return callback([]);
            }

            callback((JSON.parse(this.responseText).services) || []);
        };

        var cleanup = function() {
            xhr.removeEventListener('load', onLoadEvent);
            xhr.removeEventListener('error', onErrorEvent);
            xhr.removeEventListener('abort', onErrorEvent);
        };

        var onErrorEvent = function() {
            cleanup();
            callback([]);
        };


        try {
            xhr.open('get', actualUrl, true);
            xhr.addEventListener('load', onLoadEvent);
            xhr.addEventListener('error', onErrorEvent);
            xhr.addEventListener('abort', onErrorEvent);
            xhr.responseType = 'text';
            xhr.send();
        } catch (e) {
            onErrorEvent.call(xhr);
        }
    };


    /**
     * Build a list of hostnames for each service according to a list of cookies domains.
     * Domain can start from '.' or can be not a root domain
     *      but hostname must be a root domain for comparing it with a page opened in a tab
     *      and for inserting it to a domains whitelist.
     * @param {Object[]} services
     */
    CookieHandling.prototype.buildRemLoginServiceHostnames = function (services) {
        services.forEach(function (service) {
            let hostnames = [];
            service.domains.map(function (domainData) {
                let domain = trimDots(domainData.name);
                hostnames.push(domain);
                let root = prepareRootDomain(domain);
                if (root !== domain && hostnames.indexOf(root) === -1)
                    hostnames.push(root);
            });
            service.hostnames = hostnames;
        });
    };


    /**
     * Find and returns a service with all its domains and their cookies
     * @param {string} hostname
     * @returns {{name: <string>, domains: <object[]>, hostnames: <string[]>}}
     */
    CookieHandling.prototype.getRemLoginServiceByHost = function (hostname) {
        var services = ub.cookiesSettings.rememberLoginServices,
            foundService = null;

        for (var i = 0; (i < services.length && !foundService); i++) {
            var service = services[i];

            if (service.hostnames.indexOf(hostname) !== -1 ||
                service.hostnames.indexOf(prepareRootDomain(hostname)) !== -1)
            {
                foundService = service;
                break;
            }
        }

        return foundService;
    };

    CookieHandling.prototype.getRemLoginServiceByName = function (name) {
        var services = ub.cookiesSettings.rememberLoginServices,
            foundService = null;

        for (var i = 0; (i < services.length && !foundService); i++) {
            if (services[i].name === name) {
                foundService = services[i];
                break;
            }
        }

        return foundService;
    };


    /**
     * Check if we need to show a "Remember login" window in a page.
     * Find a service in a cookiesSettings.rememberLoginServices.
     * Check service status in a cookiesSettings.rememberLoginStatuses
     * @param {string} hostname
     */
    CookieHandling.prototype.mustRemLoginShow = function (hostname) {
        if (ub.isSafari())
            return false;

        var service = this.getRemLoginServiceByHost(hostname);
        if (!service)
            return false;

        var status = this.getRemLoginServiceStatus(service.name);
        if (status === 0 || status === 1) // Already handled
            return false;

        return true;
    };

    /**
     * Returns a status of remember login handling of set service.
     * Is current service already handled or not.
     * @param {string} serviceName
     * @returns {number}
     *      -1 : not handled yet,
     *      0: handled and marked as don't ask again
     *      1: handled and marked as whitelisted
     */
    CookieHandling.prototype.getRemLoginServiceStatus = function (serviceName) {
        return ub.cookiesSettings.rememberLoginStatuses.hasOwnProperty(serviceName) ?
            ub.cookiesSettings.rememberLoginStatuses[serviceName] :
            -1;
    };

    /**
     * Set status of remember login handling of set service.
     * @param {string} serviceName
     * @param {number} status -
     *          0 : don't ask again
     *          1 : whitelisted
     */
    CookieHandling.prototype.setRemLoginServiceStatus = function (serviceName, status) {
        if ((status !== 0 && status !== 1) || !serviceName)
            return;

        ub.cookiesSettings.rememberLoginStatuses[serviceName] = status;
        this.saveSettings();
    };


    /**
     * Whitelist all domains\cookies of current service.
     * If domain has separate cookies in iit's list - whitelist only those cookies.
     * If domain has a placeholder "*" - whitelist all domain (root domain)
     * @param {string} serviceName
     */
    CookieHandling.prototype.whitelistRemLoginService = function (serviceName) {
        var service = this.getRemLoginServiceByName(serviceName);
        if (!service) return;

        service.domains.forEach(function (domainData) {
            let domain = domainData.name;
            if (domainData.cookies.length === 1 && domainData.cookies[0] === "*") {
                this.addToWhitelist(null, prepareRootDomain(domain));
            }
            else {
                domainData.cookies.forEach(function (cookieName) {
                    this.addToWhitelist({name: cookieName, domain: domain});
                }.bind(this));
            }
        }.bind(this));

        this.setRemLoginServiceStatus(serviceName, 1);
    };


    /**
     * Inject "Remember login" popup to a page (tab)
     * 1) Script injected to a page.
     * 2) Script insert iframe to a page.
     * 3) Script send message to the background.
     * 4) Background receives popup html via XMLHttpRequest and returns it to inserted script
     * 5) Script sets received html content to iframe
     * @param {number} tabId
     */
    CookieHandling.prototype.showRemLoginPopup = function (tabId) {
        if ( vAPI.isBehindTheSceneTabId(tabId) ) {
            return;
        }
        ub.scriptlets.inject(tabId, 'remember-login');
        if ( typeof vAPI.tabs.select === 'function' ) {
            vAPI.tabs.select(tabId);
        }
    }


    /****************************************************************************/
    /****************************************************************************/


    var getPageStoresByDomain = function (domain) {
        if (domain.charAt(0) === '.') {
            domain = domain.slice(1);
        }
        domain = ub.URI.domainFromHostname(domain);

        let domainPageStores = {};
        ub.pageStores.forEach(function (pageStore, tabId) {
            if (pageStore && tabId !== -1 && domain === ub.URI.domainFromHostname(pageStore.tabHostname)) {
                domainPageStores[tabId] = pageStore;
            }
        });

        // console.log ("getPageStoresByDomain ()            cookie-handling.js" +
        //                 "\n\t domain: ", domain,
        //                 "\n\t domainPageStores: ", domainPageStores,
        //                 "\n\t allPageStores: ", JSON.parse(JSON.stringify(Array.from(ub.pageStores))));
        return domainPageStores;
    };

    var urlFromCookieDomain = function(cookie) {
        let cookieDomain = cookie.domain;
        if (cookieDomain.charAt(0) === ".") {
            cookieDomain = cookieDomain.slice(1);
        }
        cookieDomain = cookie.secure ? `https://${cookieDomain}${cookie.path}` : `http://${cookieDomain}${cookie.path}`;
        return cookieDomain;
    };

    var prepareRootDomain = function (domain) {
        if (domain.charAt(0) === '.') {
            domain = domain.slice(1);
        }
        return ub.URI.domainFromHostname(domain);
    };

    var trimDots = function (str) {
        if (str.charAt(0) === '.') {
            str = str.slice(1);
        }
        if (str.charAt(str.length -1) === '.') {
            str = str.slice(str.length - 1);
        }
        return str;
    };



    /****************************************************************************/





    return new CookieHandling();
})();
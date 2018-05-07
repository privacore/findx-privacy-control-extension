/**
 * @file

    TODO: change cookie handling settings via "µBlock.changeUserSettings"
 * @author Igor Petrenko
 * @date  4/18/2018
 */

"use strict";

µBlock.cookieHandling = (function () {
    var ub = µBlock;

    var CookieHandling = function () {
        this.thirdPartyCookies = [];
        this.tabsDomainsList = new Set();

        vAPI.cookies.onChanged = this.onCookieChanged.bind(this);
    };

    CookieHandling.prototype.tabsDomainsList = null;
    CookieHandling.prototype.thirdPartyCookies = null;


    /**
     * Init method will be called from start.js after all settings will be loaded from storage
     *  and all tabs will be handled.
     */
    CookieHandling.prototype.init = function () {
        this.updateTabsDomainsList();

        this.handleStatistics();

        if (ub.userSettings.pauseFiltering)
            return;

        vAPI.cookies.registerListeners();

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
        this.updateTabsDomainsList();

        if (ub.userSettings.pauseFiltering) {
            return;
        }

        if (ub.cookiesSettings.clearDomainCookiesOnTabClose && !this.isDomainProtected(domain)) {
            vAPI.setTimeout(function () {
                this.updateTabsDomainsList();
                if (!this.isDomainOpenedInTabs(domain)) {
                    this.clearDomainCookies(domain, url);
                }
                else {
                    console.log("Domain %copened in tab %c so it's cookies wasn't cleared", 'color:green', 'color: black');
                }
            }.bind(this), ub.cookiesSettings.clearDomainCookiesAfter);
        }
        else if (this.isDomainProtected(domain)) {
            console.log("Domain '%s' %cProtected %c so it's cookies wasn't cleared", domain, 'color:green', 'color: black');
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

        console.groupCollapsed("TABS UPDATING");
        console.log("\ttabsDomainsList: ", JSON.parse(JSON.stringify(Array.from(this.tabsDomainsList))));
        console.log("\ttabsDomainsList: ", JSON.parse(JSON.stringify(Array.from(ub.pageStores))));
        console.log("\ttabsDomainsList: ", JSON.parse(JSON.stringify(Array.from(ub.tabContextManager.getAll()))));
        console.groupEnd();
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
        if (Object.keys(domainPageStores).length) {
            Object.keys(domainPageStores).forEach(function (id) {
                if (isRemoved)
                    domainPageStores[id].rmDomainCookie(cookie);
                else {
                    domainPageStores[id].addDomainCookie(cookie);
                    this.increaseStats(false, true);
                }
            }.bind(this));
        }
        if (isRemoved)
            console.groupCollapsed("%c1p", 'color: purple');
        else
            console.groupCollapsed("%c1p", 'color: green');
        console.log("\tcookie: ", cookie);
        console.log("\tisRemoved: ", isRemoved);
        console.log("\tdomainPageStores: ", JSON.parse(JSON.stringify(domainPageStores)));
        console.log("\tpageStores: ", JSON.parse(JSON.stringify(Array.from(ub.pageStores))));
        console.log("\ttabsDomainsList: ", this.tabsDomainsList);
        console.groupEnd();
    };

    /****************************************************************************/

    /**
     * Add/remove cookie to thirdPartyCookies list
     * @param {object} cookie
     * @param {boolean} isRemoved
     */
    CookieHandling.prototype.handleThirdPartyCookie = function (cookie, isRemoved) {
        if (isRemoved)
            console.groupCollapsed("%c3p", 'color:purple');
        else
            console.group("%c3p", 'color:orange');

        if (!isRemoved && ub.cookiesSettings.thirdPartyCookiesBlocking && !this.isCookieProtected(cookie, true)) {
            vAPI.cookies.removeCookie(cookie, urlFromCookieDomain(cookie));
            this.increaseStats(true, false);
            console.log("%cBLOCK", 'color:red');
        }
        else { // 3p cookie not blocked. So we need to add/remove it from thirdPartyCookies list
            if (this.isThirdPartyCookieExists(cookie)) {
                if (isRemoved)
                    this.rmThirdPartyCookie(cookie);
                else {
                    this.updateThirdPartyCookie(cookie);
                    this.increaseStats(false, false);
                }
            }
            else if (!isRemoved) {
                this.addThirdPartyCookie(cookie);
                this.increaseStats(false, false);
            }
        }

        console.log("\tcookie: ", cookie);
        console.log("\tisRemoved: ", isRemoved);
        console.log("\tthirdPartyCookies: ", JSON.parse(JSON.stringify(this.thirdPartyCookies)));
        console.log("\ttabsDomainsList: ", this.tabsDomainsList);
        console.groupEnd();
    };

    CookieHandling.prototype.isThirdPartyCookieExists = function (cookie) {
        return this.thirdPartyCookies.some(function (storedCookie) {
            return cookie.name === storedCookie.name && cookie.domain === storedCookie.domain;
        });
    };

    CookieHandling.prototype.addThirdPartyCookie = function (cookie) {
        this.thirdPartyCookies.push(cookie);
    };

    CookieHandling.prototype.updateThirdPartyCookie = function (cookie) {
        let cookieIndex = this.thirdPartyCookies.findIndex(function (storedCookie, index) {
            return cookie.name === storedCookie.name && cookie.domain === storedCookie.domain;
        });
        if (cookieIndex !== -1) {
            this.thirdPartyCookies[cookieIndex] = cookie;
        }
    };

    CookieHandling.prototype.rmThirdPartyCookie = function (cookie) {
        let cookieIndex = this.thirdPartyCookies.findIndex(function (storedCookie, index) {
            return cookie.name === storedCookie.name && cookie.domain === storedCookie.domain;
        });
        if (cookieIndex !== -1) {
            this.thirdPartyCookies.splice(cookieIndex, 1);
        }
    };


    /****************************************************************************/

    CookieHandling.prototype.isDomainProtected = function (domain) {
        return ub.cookiesSettings.protection.domains.indexOf(domain) !== -1;
    };

    CookieHandling.prototype.protectDomain = function (domain) {
        domain = prepareRootDomain(domain);
        if (ub.cookiesSettings.protection.domains.indexOf(domain) === -1)
            ub.cookiesSettings.protection.domains.push(domain);

        this.saveSettings();
    };

    CookieHandling.prototype.unProtectDomain = function (domain) {
        domain = prepareRootDomain(domain);
        let domainIndex = ub.cookiesSettings.protection.domains.indexOf(domain);

        if (domainIndex !== -1)
            ub.cookiesSettings.protection.domains.splice(domainIndex, 1);

        this.saveSettings();
    };

    /****************************************************************************/

    CookieHandling.prototype.isCookieProtected = function (cookie, isThirdParty, forDomain) {
        let protectionList = isThirdParty ?
            ub.cookiesSettings.protection.cookies.thirdParty
            : ub.cookiesSettings.protection.cookies.firstParty;

        let domain = forDomain ? forDomain : cookie.domain;
        domain = prepareRootDomain(domain);

        return protectionList.hasOwnProperty(domain) && protectionList[domain].has(cookie.name);
    };

    CookieHandling.prototype.isCookieProtectedAnyParty = function (cookie) {
        let domain = prepareRootDomain(cookie.domain);
        return this.isCookieProtected(cookie, true, domain) || this.isCookieProtected(cookie, false, domain);
    };

    /**
     * Protect cookie.
     * List of separate first/third party cookie protected for each domain.
     * If protected cookie is first party - domain must be set in "domain" parameter.
     * If protected cookie is third party - domain received from cookie object.
     * @param {Cookie} cookie
     * @param {boolean} isFirstParty
     * @param {string} [domain] - used on first party cookie protect
     */
    CookieHandling.prototype.protectCookie = function (cookie, isFirstParty, domain) {
        domain = prepareRootDomain((isFirstParty ? domain: cookie.domain));
        let partyName = isFirstParty ? 'firstParty' : 'thirdParty';
        if (!ub.cookiesSettings.protection.cookies[partyName][domain]
            || !ub.cookiesSettings.protection.cookies[partyName][domain].size)
        {
            ub.cookiesSettings.protection.cookies[partyName][domain] = new Map();
        }
        if (!ub.cookiesSettings.protection.cookies[partyName][domain].has(cookie.name)) {
            ub.cookiesSettings.protection.cookies[partyName][domain].set(cookie.name, cookie);
        }

        this.saveSettings();
    };

    CookieHandling.prototype.unProtectCookie = function (cookie, isFirstParty, domain) {
        domain = prepareRootDomain((isFirstParty ? domain: cookie.domain));
        let partyName = isFirstParty ? 'firstParty' : 'thirdParty';
        if (!ub.cookiesSettings.protection.cookies[partyName][domain]
            || !ub.cookiesSettings.protection.cookies[partyName][domain].size)
        {
            return;
        }
        if (ub.cookiesSettings.protection.cookies[partyName][domain].has(cookie.name)) {
            ub.cookiesSettings.protection.cookies[partyName][domain].delete(cookie.name);
        }

        if (!ub.cookiesSettings.protection.cookies[partyName][domain].size) {
            delete ub.cookiesSettings.protection.cookies[partyName][domain];
        }

        this.saveSettings();
    };


    /****************************************************************************/

    CookieHandling.prototype.clearDomainCookies = function (domain, url) {
        if (this.isDomainProtected(domain)) {
            console.log("Domain %cProtected %c so it's cookies wasn't cleared", 'color:green', 'color: black');
            return;
        }

        vAPI.cookies.getDomainCookies(domain, function (cookies) {
            console.groupCollapsed('%cDOMAIN COOKIES CLEARING: %s', 'color: red', domain);
            console.log('\t%c%s', 'color: black', domain);
            console.log('\t%c%s', 'color: black', url);
            console.log('\t%O', JSON.parse(JSON.stringify(cookies)));

            cookies.forEach(function (cookieItem) {
                if (!this.isCookieProtected(cookieItem, false, domain)) {
                    vAPI.cookies.removeCookie(cookieItem, url);
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

    CookieHandling.prototype.changeSettings = function (name, value) {
        var settings = ub.cookiesSettings;

        if ( name === undefined || typeof name !== 'string' || name === '' || value === undefined) {
            return;
        }

        settings[name] = value;

        this.saveSettings();
    };

    CookieHandling.prototype.saveSettings = function () {
        var settings = JSON.parse(JSON.stringify(ub.cookiesSettings));

        settings.protection.cookies.firstParty = this.serializeCookiesProtectionList(ub.cookiesSettings.protection.cookies.firstParty);
        settings.protection.cookies.thirdParty = this.serializeCookiesProtectionList(ub.cookiesSettings.protection.cookies.thirdParty);

        vAPI.storage.set(settings);
    };

    /**
     * Convert protected cookies list to object which can be saved in storage.
     * Cookies for each domain is a Map, so we need to convert it to array to save in storage.
     * @param {{string: Map<string, object>}} list - {domain: Map<cookieName, cookieObject>}
     * @returns {{string: [string, object][]}}
     */
    CookieHandling.prototype.serializeCookiesProtectionList = function (list) {
        var response = {};
        let domains = Object.keys(list);
        if (!domains.length)
            return list;

        domains.forEach(function (domain) {
            response[domain] = Array.from(list[domain]);
        });
        return response;
    };

    /**
     * Restore saved settings and protection lists fetched from storage on app start.
     * Protection lists for each domain stored in local storage as array, so we need convert them to a Map objects.
     */
    CookieHandling.prototype.restoreFromFetched = function () {
        this.protectedCookiesFromFetch('firstParty');
        this.protectedCookiesFromFetch('thirdParty');
    };

    /**
     * Protection lists for each domain stored in local storage as array, so we need convert them to a Map objects.
     * @param party
     */
    CookieHandling.prototype.protectedCookiesFromFetch = function (party) {
        for (var domain in ub.cookiesSettings.protection.cookies[party]) {
            if (!ub.cookiesSettings.protection.cookies[party].hasOwnProperty(domain))
                continue;
            ub.cookiesSettings.protection.cookies[party][domain] = new Map(ub.cookiesSettings.protection.cookies[party][domain]);
        }
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
                    if (this.isDomainProtected(prepareRootDomain(cookie.domain)) || this.isCookieProtected(cookie, true)
                        || (!this.isThirdParty(cookie) && this.isCookieProtected(cookie, false)))
                    {
                        // TODO: Test logs. Current block of if else statements used only for tests. Must be removed in a release version.
                        if (this.isDomainProtected(prepareRootDomain(cookie.domain))) {
                            console.log('\t  %cprotected %ccookie domain %c"%s"', 'color: green', 'color: black', 'color: green', cookie.domain);
                        }
                        else if (this.isCookieProtected(cookie, true)) {
                            console.log('\t  %cprotected %c3p', 'color: green', 'color: black');
                        }
                        else if (!this.isThirdParty(cookie) && this.isCookieProtected(cookie, false)) {
                            console.log('\t  %cprotected %c1p', 'color: green', 'color: black');
                        }
                        /////////////////////////////////////// end of test logs

                        return;
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






    return new CookieHandling();
})();
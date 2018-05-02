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


    CookieHandling.prototype.init = function () {
        this.updateTabsDomainsList();

        vAPI.cookies.registerListeners();

        this.protectDomain('file.org');
        this.protectCookie({
            domain:".file.org",
            expirationDate:1587630965,
            hostOnly:false,
            httpOnly:false,
            name:"__utma",
            path:"/",
            sameSite:"no_restriction",
            secure:false,
            session:false,
            storeId:"0",
            value:"35879863.1994226522.1524558835.1524558835.1524558835.1"
        }, true, 'file.org');

        this.protectCookie({
            domain:".doubleclick.net",
            expirationDate:1524560253.961126,
            hostOnly:false,
            httpOnly:false,
            name:"test_cookie",
            path:"/",
            sameSite:"no_restriction",
            secure:false,
            session:false,
            storeId:"0",
            value:"CheckForPermission"
        }, false);

        setTimeout(function () {
            this.changeSettings('clearDomainCookiesAfter', 1000);
        }.bind(this), 5000);
    };

    CookieHandling.prototype.onTabUpdate = function (tabId) {
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

        if (this.isThirdParty(changeInfo.cookie)) {
            this.handleThirdPartyCookie(changeInfo.cookie, changeInfo.removed);
        }
        else {
            this.handleFirstPartyCookie(changeInfo.cookie, changeInfo.removed);
        }
    };

    CookieHandling.prototype.onDomainClosed = function (domain, url) {
        this.updateTabsDomainsList();
        if (ub.cookiesSettings.clearDomainCookiesOnTabClose && !this.isDomainProtected(domain)) {
            setTimeout(function () {
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

    /******************************************************************************/

    /**
     * Check is cookie domain is opened in any tab.
     * @param {object} cookie
     * @returns {boolean}
     */
    CookieHandling.prototype.isThirdParty = function (cookie) {
        let domain = cookie.domain;
        if (domain.charAt(0) === '.') {
            domain = domain.slice(1);
        }
        domain = ub.URI.domainFromHostname(domain);
        return !this.tabsDomainsList.has(domain);
    };

    /**
     * Add/remove cookie to pagestores with equal domains.
     * @param {object} cookie
     * @param {boolean} isRemoved
     */
    CookieHandling.prototype.handleFirstPartyCookie = function (cookie, isRemoved) {
        let domain = cookie.domain;
        if (domain.charAt(0) === '.') {
            domain = domain.slice(1);
        }
        domain = ub.URI.domainFromHostname(domain);
        let domainPageStores = getPageStoresByDomain(domain);
        if (Object.keys(domainPageStores).length) {
            Object.keys(domainPageStores).forEach(function (id) {
                if (isRemoved)
                    domainPageStores[id].rmDomainCookie(cookie);
                else
                    domainPageStores[id].addDomainCookie(cookie);
            });
        }
        console.groupCollapsed("%c1p", 'color: green');
        console.log("\tcookie: ", cookie);
        console.log("\tisRemoved: ", isRemoved);
        console.log("\tdomainPageStores: ", JSON.parse(JSON.stringify(domainPageStores)));
        console.log("\tpageStores: ", JSON.parse(JSON.stringify(Array.from(ub.pageStores))));
        console.log("\ttabsDomainsList: ", this.tabsDomainsList);
        console.groupEnd();
    };

    /******************************************************************************/

    /**
     * Add/remove cookie to thirdPartyCookies list
     * @param {object} cookie
     * @param {boolean} isRemoved
     */
    CookieHandling.prototype.handleThirdPartyCookie = function (cookie, isRemoved) {
        console.group("%c3p", 'color:orange');

        if (!isRemoved && ub.cookiesSettings.thirdPartyCookiesBlocking && !this.isCookieProtected(cookie, true)) {
            vAPI.cookies.removeCookie(cookie, urlFromCookieDomain(cookie));
            console.log("%cBLOCK", 'color:red');
        }
        else { // 3p cookie not blocked. So we need to add/remove it from thirdPartyCookies list
            if (this.isThirdPartyCookieExists(cookie)) {
                if (isRemoved)
                    this.rmThirdPartyCookie(cookie);
                else
                    this.updateThirdPartyCookie(cookie);
            }
            else if (!isRemoved) {
                this.addThirdPartyCookie(cookie);
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


    /******************************************************************************/

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

    /******************************************************************************/

    CookieHandling.prototype.isCookieProtected = function (cookie, isThirdParty, forDomain) {
        let protectionList = isThirdParty ?
            ub.cookiesSettings.protection.cookies.thirdParty
            : ub.cookiesSettings.protection.cookies.firstParty;

        let domain = isThirdParty ? cookie.domain : forDomain;
        domain = prepareRootDomain(domain);

        return protectionList.hasOwnProperty(domain) && protectionList[domain].has(cookie.name);
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


    /******************************************************************************/

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

    /******************************************************************************/

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

    /******************************************************************************/


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
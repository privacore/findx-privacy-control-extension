/**
 * @file

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
        if (ub.userSettings.clearDomainCookiesOnTabClose) {
            setTimeout(function () {
                this.updateTabsDomainsList();
                if (!this.isDomainOpenedInTabs(domain)) { // TODO: check is domain not protected
                    clearDomainCookies(domain, url);
                }
            }.bind(this), ub.userSettings.clearDomainCookiesAfter);
        }
    };

    /**
     * Update the list of root domains opened in all tabs.
     * Current list updated each time when any tab updated or closed.
     * Current list used just for faster checking of third parties cookies and cookies clearing.
     */
    CookieHandling.prototype.updateTabsDomainsList = function () {
        let allPageStores = ub.pageStores;
        let tabIds = Object.keys(allPageStores);

        this.tabsDomainsList = new Set();

        tabIds.forEach(function (tabId) {
            let pageStore = allPageStores[tabId];
            if (pageStore && tabId !== -1 && tabId !== "-1") {
                let domain = ub.URI.domainFromHostname(pageStore.tabHostname);
                if (!this.tabsDomainsList.has(domain)) {
                    this.tabsDomainsList.add(domain);
                }
            }
        }, this);

        console.groupCollapsed("TABS UPDATING");
        console.log("\ttabsDomainsList: ", JSON.parse(JSON.stringify(Array.from(this.tabsDomainsList))));
        console.log("\tallPageStores: ", JSON.parse(JSON.stringify(allPageStores)));
        console.log("\tµb.tabContextManager: ", JSON.parse(JSON.stringify(ub.tabContextManager.getAll())));
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
        console.log("\tpageStores: ", JSON.parse(JSON.stringify(ub.pageStores)));
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

        if (!isRemoved && ub.userSettings.thirdPartyCookiesBlocking) { // TODO: check is 3p cookie protected
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
        console.groupEnd("3p");
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
            this.thirdPartyCookies = this.thirdPartyCookies.splice(cookieIndex, 1);
        }
    };


    /******************************************************************************/


    var clearDomainCookies = function (domain, url) {
        vAPI.cookies.getDomainCookies(domain, function (cookies) {
            console.groupCollapsed('%cDOMAIN COOKIES CLEARING: %s', 'color: red', domain);
            console.log('\t%c%s', 'color: black', domain);
            console.log('\t%c%s', 'color: black', url);
            console.log('\t%O', JSON.parse(JSON.stringify(cookies)));

            cookies.forEach(function (cookieItem) {
                // TODO: check is cookie not protected
                vAPI.cookies.removeCookie(cookieItem, url);

                console.log("\t%cRemoved: %c%s", "color: red", "color:black", cookieItem.name);
                console.log("\t", cookieItem);
            });

            console.groupEnd();
        });
    };

    var getPageStoresByDomain = function (domain) {
        let allPageStores = ub.pageStores;
        let tabIds = Object.keys(allPageStores);
        let initDomain = domain;

        if (domain.charAt(0) === '.') {
            domain = domain.slice(1);
        }
        domain = ub.URI.domainFromHostname(domain);

        let domainPageStores = {};
        tabIds.forEach(function (tabId) {
            let pageStore = allPageStores[tabId];
            if (pageStore && tabId !== -1 && domain === ub.URI.domainFromHostname(pageStore.tabHostname)) {
                domainPageStores[tabId] = pageStore;
            }
        });

        // console.log ("getPageStoresByDomain ()            cookie-handling.js" +
        //                 "\n\t domain: ", domain,
        //                 "\n\t initDomain: ", initDomain,
        //                 "\n\t domainPageStores: ", domainPageStores,
        //                 "\n\t allPageStores: ", allPageStores);
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






    return new CookieHandling();
})();
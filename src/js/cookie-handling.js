/**
 * @file

 * @author Igor Petrenko
 * @date  4/18/2018
 */

"use strict";

µBlock.cookieHandling = (function () {
    var ub = µBlock;

    var CookieHandling = function () {
        vAPI.cookies.onChanged = this.onCookieChanged;
        vAPI.cookies.registerListeners();
        // this.initTabsContext();
    };

    CookieHandling.prototype.initTabsContext = function () {
        // let allTabsContext = ub.tabContextManager.getAll();
        // console.log ("initTabsContext ()            cookie-handling.js" +
        //                 "\n\t allTabsContext: ", allTabsContext);
    };

    CookieHandling.prototype.onTabUpdate = function (tabId) {
        // let allTabsContext = ub.tabContextManager.getAll();
        // console.log ("onTabUpdate ()            cookie-handling.js" +
        //                 "\n\t allTabsContext: ", allTabsContext);
    };


    CookieHandling.prototype.onDomainClosed = function (domain, url) {
        if (ub.userSettings.clearDomainCookiesOnTabClose) {
            setTimeout(function () {
                if (!isDomainOpenedInTabs(domain)) {
                    clearDomainCookies(domain, url);
                }
            }, ub.userSettings.clearDomainCookiesAfter);
        }
    };

    var clearDomainCookies = function (domain, url) {
        // console.log ("clearDomainCookies ()            cookie-handling.js" +
        //                 "\n\t domain: ", domain);
        vAPI.cookies.getDomainCookies(domain, function (cookies) {
            cookies.forEach(function (cookieItem) {
                // TODO: check is cookie protected
                vAPI.cookies.removeCookie(cookieItem, url);
            });
        });
    };

    /**
     * Check is set domain opened in any other tab. Comparing by root domains.
     * @param {string} domain
     * @returns {boolean}
     */
    var isDomainOpenedInTabs = function (domain) {
        let allPageStores = ub.pageStores;
        let tabIds = Object.keys(allPageStores);

        return !!tabIds.find(function (tabId) {
            return allPageStores[tabId] && ub.URI.domainFromHostname(allPageStores[tabId].tabHostname) === domain;
        });
    };



    CookieHandling.prototype.onCookieChanged = function (changeInfo) {
        // let allTabsContext = ub.tabContextManager.getAll();
        // console.log ("updateActiveTabsList ()            cookie-handling.js" +
        //                 "\n\t allTabsContext: ", allTabsContext);
    };




    return new CookieHandling();
})();
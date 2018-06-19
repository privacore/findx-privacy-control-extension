/*******************************************************************************

    uBlock - a browser extension to block requests.
    Copyright (C) 2015 Raymond Hill

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

    var messaging = vAPI.messaging;
    var details = {};

    (function() {
        var matches = /details=([^&]+)/.exec(window.location.search);
        if ( matches === null ) {
            return;
        }
        details = JSON.parse(atob(matches[1]));
    })();

    /******************************************************************************/

    var renderView = function () {
        $('#blocked_url').text(details.url);

        showRules();
        showFilters();
    };

    /******************************************************************************/

    var showRules = function () {
        if (!details.fs) {
            $('.rules-list-item').hide();
            return;
        }
        else {
            $('.rules-list-item').show();
        }

        var elRulesList = $('.filter-rules');
        elRulesList.html('');

        if (typeof details.fs === 'object') {
            details.fs.forEach(function (rule) {
                var elRule = createRuleItem(rule);
                elRulesList.append(elRule);
            });
        }
        else if (typeof details.fs === 'string') {
            var elRule = createRuleItem(details.fs);
            elRulesList.append(elRule);
        }
    };

    var createRuleItem = function (rule) {
        var elRule = $("<div></div>");
        elRule.addClass('filter-rule');
        elRule.text(rule);
        return elRule;
    };

    /******************************************************************************/

    var showFilters = function () {
        if (!details.fp) {
            $('.filters-list-item').hide();
            return;
        }
        else {
            $('.filters-list-item').show();
        }

        var elFiltersList = $('.filter-list');
        elFiltersList.html('');

        if (Array.isArray(details.fp)) {
            details.fp.forEach(function (filter) {
                var elFilter = createFilterItem(filter);
                elFiltersList.append(elFilter);
            });
        }
        else {
            var elFilter = createFilterItem(details.fp);
            elFiltersList.append(elFilter);
        }
    };

    var createFilterItem = function (filterData) {
        return $("<div class='filter-item'><span>" + decodeURIComponent(filterData.name)
            + "</span> | <span style='text-transform: capitalize;'>" + filterData.group + "</span></div>");
    };

    /******************************************************************************/

    var handleControls = function () {
        handleDetailsBtn();
        handleCloseBtns();
        handleAllowOnceBtn();
        handleAllowAlwaysBtn();
    };

    /******************************************************************************/

    var handleDetailsBtn = function () {
        $('.details-btn').off("click");
        $('.details-btn').on("click", function (ev) {
            toggleDetailedInformation();
        });
    };

    var toggleDetailedInformation = function () {
        document.querySelector('#content').classList.toggle('active');
    };

    /******************************************************************************/

    var handleCloseBtns = function () {
        $('.cancel-btn').off("click");
        $('.cancel-btn').on("click", function (ev) {
            messaging.send(
                'documentBlocked',
                {
                    what: 'closeTabId',
                    tabId: details.tabId
                },
                proceedToURL
            );
        });
    };

    /******************************************************************************/

    var handleAllowOnceBtn = function () {
        $('.allow-once-btn').off("click");
        $('.allow-once-btn').on("click", proceedTemporary);
    };

    var proceedTemporary = function() {
            messaging.send(
                'documentBlocked',
                {
                    what: 'temporarilyWhitelistDocument',
                    hostname: details.hn
                },
                proceedToURL
            );
    };

    /******************************************************************************/

    var handleAllowAlwaysBtn = function () {
        $('.always-allow-btn').off("click");
        $('.always-allow-btn').on("click", proceedPermanent);
    };

    var proceedPermanent = function() {
        messaging.send(
            'documentBlocked',
            {
                what: 'toggleHostnameSwitch',
                name: 'no-strict-blocking',
                hostname: details.hn,
                deep: true,
                state: true
            },
            proceedToURL
        );
    };

    /******************************************************************************/

    var proceedToURL = function() {
        window.location.replace(details.url);
    };

    /******************************************************************************/


    uDom.onLoad(function () {
        renderView();
        handleControls();


        $("body").mCustomScrollbar({
            autoHideScrollbar: false,
            scrollButtons:{ enable: false },
            advanced:{ updateOnContentResize: true }
        });
    });

})();

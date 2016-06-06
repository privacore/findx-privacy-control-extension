/*******************************************************************************

    µBlock - a browser extension to block requests.
    Copyright (C) 2014 Raymond Hill

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



/******************************************************************************/

var loadDashboardPanel = function(tab, q) {
    //TODO: 25.01.16 - uncomment after uBlock's logic will be complete
    //var pane = window.location.hash.slice(1);
    //if ( pane === '' ) {
    //    pane = 'settings.html';
    //}
    //var tabButton = uDom('[href="#' + pane + '"]');
    //if ( !tabButton || tabButton.hasClass('selected') ) {
    //    return;
    //}
    //uDom('.tabButton.selected').toggleClass('selected', false);
    //uDom('iframe').attr('src', pane);
    //tabButton.toggleClass('selected', true);

    var tabButton = uDom('[href="#' + tab + '"]');
    if ( !tabButton ) {
        return;
    }
    q = q || '';
    uDom('div:not(.ui-tabs-hide) iframe').attr('src', tab + ".html" + q);
    //uDom('.tabButton').toggleClass('selected', false);
    //tabButton.toggleClass('selected', true);
};

/******************************************************************************/

var onTabClickHandler = function(e) {
    //var url = window.location.href,
    //    pos = url.indexOf('#');
    //if ( pos !== -1 ) {
    //    url = url.slice(0, pos);
    //}
    //url += this.hash;
    //if ( url !== window.location.href ) {
    //    window.location.replace(url);
    //    loadDashboardPanel();
    //}
    e.preventDefault();
    loadDashboardPanel(this.hash.slice(1)); // 25.01.16 - Last commit is not complete, so we implement an old logic
};

/******************************************************************************/

uDom.onLoad(function() {
    // Display jQuery UI elements
    $("#tabs").tabs();
    $("button").button();
    //    window.addEventListener('resize', resizeFrame);

    var matches = window.location.search.slice(1).match(/\??(tab=([^&]+))?(.*)$/);
    var tab = '', q = '';
    if ( matches && matches.length === 4 ) {
        tab = matches[2];
        q = matches[3];
        if ( q !== '' && q.charAt(0) === '&' ) {
            q = '?' + q.slice(1);
        }
    }
    if ( !tab ) {
        tab = '3p-filters-incognitor';
    }

    //resizeFrame();
    //window.addEventListener('resize', resizeFrame);
    uDom('.tabButton').on('click', onTabClickHandler);
    loadDashboardPanel(tab, q);
});

/******************************************************************************/

})();

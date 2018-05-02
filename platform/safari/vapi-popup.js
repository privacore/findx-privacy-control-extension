/*******************************************************************************

    uBlock - a browser extension to block requests.
    Copyright (C) 2014-2016 The uBlock authors

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
(function() {
'use strict';

if ( typeof safari.self === 'undefined' || window.top !== window ) {
    return;
}

/**
 * Modified by alexey.lepesin on 04.27.2017
 */
var onLoaded = function() {
    var body = document.body,
        popover = safari.self;

    var updateSize = function() {
        popover.width = body.clientWidth;
        popover.height = body.clientHeight;
    };

    setTimeout(updateSize, 0);
};

window.addEventListener('load', onLoaded);
})();

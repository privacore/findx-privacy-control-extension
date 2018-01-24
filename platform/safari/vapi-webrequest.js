/*******************************************************************************

 uBlock - a browser extension to block requests.
 Copyright (C) 2018 The uBlock authors

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

/* global self, safari, SafariBrowserTab, µBlock */

// For background page

'use strict';

/******************************************************************************/

vAPI.net = {};

vAPI.net.registerListeners = function() {
    var µb = µBlock,
        µburi = µb.URI;

    // Until Safari has more specific events, those are instead handled
    // in the onBeforeRequestAdapter; clean them up so they're garbage-collected
    vAPI.net.onBeforeSendHeaders = null;

    var onBeforeRequest = vAPI.net.onBeforeRequest,
        onBeforeRequestClient = onBeforeRequest.callback,
        onHeadersReceivedClient = vAPI.net.onHeadersReceived.callback;

    // https://github.com/el1t/uBlock-Safari/issues/32
    // Ignore directives
    var shouldBlockResponseHeader = {
        script: /script-src/,
        worker: /child-src/
    };

    var onBeforeRequestAdapter = function(e) {
        if ( e.name !== 'canLoad' ) {
            return;
        }
        e.stopPropagation && e.stopPropagation();
        switch ( e.message.type ) {
            case 'main_frame':
                vAPI.tabs.onNavigation({
                    url: e.message.url,
                    frameId: 0,
                    tabId: vAPI.tabs.getTabId(e.target).toString()
                });
                e.message.hostname = µburi.hostnameFromURI(e.message.url);
                e.message.tabId = vAPI.tabs.getTabId(e.target);
                e.message.responseHeaders = [];
                onBeforeRequestClient(e.message);
                var blockVerdict = onHeadersReceivedClient(e.message);
                blockVerdict = blockVerdict && blockVerdict.responseHeaders && blockVerdict.responseHeaders[0] &&
                    shouldBlockResponseHeader.script.test(blockVerdict.responseHeaders[0].value);
                e.message = {
                    shouldBlock: blockVerdict === true
                };
                return;
            case 'popup':
                var openerTabId = vAPI.tabs.getTabId(e.target).toString();
                var shouldBlock = !!vAPI.tabs.onPopupUpdated('preempt', openerTabId, e.message.url);
                if ( !shouldBlock ) {
                    vAPI.tabs.popupCandidate = openerTabId;
                }
                e.message = {
                    shouldBlock: shouldBlock
                };
                break;
            case 'popstate':
                // No return value/message
                vAPI.tabs.onUpdated(vAPI.tabs.getTabId(e.target), {
                    url: e.message.url
                }, {
                    url: e.message.url
                });
                break;
            case 'worker':
                e.message.type = 'sub_frame';
                e.message.hostname = µburi.hostnameFromURI(e.message.url);
                e.message.tabId = vAPI.tabs.getTabId(e.target);
                e.message.responseHeaders = [];
                var blockVerdict = onHeadersReceivedClient(e.message);
                blockVerdict = blockVerdict && blockVerdict.responseHeaders && blockVerdict.responseHeaders[0] &&
                    shouldBlockResponseHeader.worker.test(blockVerdict.responseHeaders[0].value);
                e.message = {
                    shouldBlock: blockVerdict === true
                }
                return;
            default:
                e.message.hostname = µburi.hostnameFromURI(e.message.url);
                e.message.tabId = vAPI.tabs.getTabId(e.target);
                var blockVerdict = onBeforeRequestClient(e.message) || {};
                blockVerdict.shouldBlock = blockVerdict.cancel === true || blockVerdict.redirectUrl !== undefined;
                e.message = blockVerdict;
                return;
        }
    };
    safari.application.addEventListener('message', onBeforeRequestAdapter, true);
};

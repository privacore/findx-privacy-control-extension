/**
 * @file

 * @author Igor Petrenko
 * @date  7/5/2018
 */


/******************************************************************************/
/******************************************************************************/

/*! http://mths.be/cssescape v0.2.1 by @mathias | MIT license */
;(function(root) {

    if (!root.CSS) {
        root.CSS = {};
    }

    var CSS = root.CSS;

    var InvalidCharacterError = function(message) {
        this.message = message;
    };
    InvalidCharacterError.prototype = new Error();
    InvalidCharacterError.prototype.name = 'InvalidCharacterError';

    if (!CSS.escape) {
        // http://dev.w3.org/csswg/cssom/#serialize-an-identifier
        CSS.escape = function(value) {
            var string = String(value);
            var length = string.length;
            var index = -1;
            var codeUnit;
            var result = '';
            var firstCodeUnit = string.charCodeAt(0);
            while (++index < length) {
                codeUnit = string.charCodeAt(index);
                // Note: there’s no need to special-case astral symbols, surrogate
                // pairs, or lone surrogates.

                // If the character is NULL (U+0000), then throw an
                // `InvalidCharacterError` exception and terminate these steps.
                if (codeUnit === 0x0000) {
                    throw new InvalidCharacterError(
                        'Invalid character: the input contains U+0000.'
                    );
                }

                if (
                    // If the character is in the range [\1-\1F] (U+0001 to U+001F) or is
                // U+007F, […]
                (codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit === 0x007F ||
                // If the character is the first character and is in the range [0-9]
                // (U+0030 to U+0039), […]
                (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
                // If the character is the second character and is in the range [0-9]
                // (U+0030 to U+0039) and the first character is a `-` (U+002D), […]
                (
                    index === 1 &&
                    codeUnit >= 0x0030 && codeUnit <= 0x0039 &&
                    firstCodeUnit === 0x002D
                )
                ) {
                    // http://dev.w3.org/csswg/cssom/#escape-a-character-as-code-point
                    result += '\\' + codeUnit.toString(16) + ' ';
                    continue;
                }

                // If the character is not handled by one of the above rules and is
                // greater than or equal to U+0080, is `-` (U+002D) or `_` (U+005F), or
                // is in one of the ranges [0-9] (U+0030 to U+0039), [A-Z] (U+0041 to
                // U+005A), or [a-z] (U+0061 to U+007A), […]
                if (
                    codeUnit >= 0x0080 ||
                    codeUnit === 0x002D ||
                    codeUnit === 0x005F ||
                    codeUnit >= 0x0030 && codeUnit <= 0x0039 ||
                    codeUnit >= 0x0041 && codeUnit <= 0x005A ||
                    codeUnit >= 0x0061 && codeUnit <= 0x007A
                ) {
                    // the character itself
                    result += string.charAt(index);
                    continue;
                }

                // Otherwise, the escaped character.
                // http://dev.w3.org/csswg/cssom/#escape-a-character
                result += '\\' + string.charAt(index);

            }
            return result;
        };
    }

}(self));

/******************************************************************************/
/******************************************************************************/

(function() {

    /******************************************************************************/

    if (
        window.top !== window ||
        typeof vAPI !== 'object' ||
        vAPI.domFilterer instanceof Object === false
    ) {
        return;
    }

    var POPUP_ID = 'findx-nudging';

    var elPopup = document.getElementById(POPUP_ID);
    if ( elPopup ) {
        return;
    }

    var popupBody = null;
    var elMenu = null;

    /******************************************************************************/

    // For browsers not supporting `:scope`, it's not the end of the world: the
    // suggested CSS selectors may just end up being more verbose.

    var cssScope = ':scope > ';

    try {
        document.querySelector(':scope *');
    } catch (e) {
        cssScope = '';
    }

    /******************************************************************************/

    var getElementBoundingClientRect = function(elem) {
        var rect = typeof elem.getBoundingClientRect === 'function' ?
            elem.getBoundingClientRect() :
            { height: 0, left: 0, top: 0, width: 0 };

        // https://github.com/gorhill/uBlock/issues/1024
        // Try not returning an empty bounding rect.
        if ( rect.width !== 0 && rect.height !== 0 ) {
            return rect;
        }

        var left = rect.left,
            right = rect.right,
            top = rect.top,
            bottom = rect.bottom;

        var children = elem.children,
            i = children.length;

        while ( i-- ) {
            rect = getElementBoundingClientRect(children[i]);
            if ( rect.width === 0 || rect.height === 0 ) {
                continue;
            }
            if ( rect.left < left ) { left = rect.left; }
            if ( rect.right > right ) { right = rect.right; }
            if ( rect.top < top ) { top = rect.top; }
            if ( rect.bottom > bottom ) { bottom = rect.bottom; }
        }

        return {
            height: bottom - top,
            left: left,
            top: top,
            width: right - left
        };
    };

    /******************************************************************************/

    // Let's have the popup code flushed from memory when no longer
    // in use: to ensure this, release all local references.

    var stopPopup = function() {
        vAPI.shutdown.remove(stopPopup);

        if ( elPopup === null ) { return; }

        // https://github.com/gorhill/uBlock/issues/2060
        if ( vAPI.domFilterer instanceof Object ) {
            vAPI.userStylesheet.remove(popupCSS1);
            vAPI.userStylesheet.remove(popupCSS2);
            vAPI.userStylesheet.apply();
        }
        vAPI.domFilterer.unexcludeNode(elPopup);

        popupBody.querySelector('.search-input_search-btn').removeEventListener('click', onSearch);
        popupBody.querySelector('.search-input > input').removeEventListener('keyup', onSearch);
        popupBody.querySelector('.header_btn__menu').removeEventListener('click', onMenuBtnClick);
        popupBody.removeEventListener('click', onBodyClick);
        popupBody.querySelector('.menu').removeEventListener('click', onMenuItemClick);
        popupBody.querySelector('#check_google_activity').removeEventListener('click', onGoogleActivityBtnClick);
        popupBody.querySelector('.header_btn__minimize').removeEventListener('click', onMinimizeBtnClick);

        elPopup.parentNode.removeChild(elPopup);
        elPopup.removeEventListener('load', stopPopup);
        elPopup = popupBody = elMenu = null;
    };

    /******************************************************************************/

    var startPopup = function(details) {
        elPopup.addEventListener('load', stopPopup);

        var frameDoc = elPopup.contentDocument;
        var parsedDom = (new DOMParser()).parseFromString(
            details.frameContent,
            'text/html'
        );

        parsedDom.documentElement.id = 'findx-nudging-popup';

        frameDoc.replaceChild(
            frameDoc.adoptNode(parsedDom.documentElement),
            frameDoc.documentElement
        );

        popupBody = frameDoc.body;

        elMenu = popupBody.querySelector('.header .menu');

        handleSearch();
        handleMenuBtn();
        handleMenuItems();
        handleMinimizeBtn();
        handleExpandBtnClick();

        if (vAPI.nudging.serviceName() === 'google') {
            handleGoogleActivityBtn();
        }

        // We must wait while texts render complete.
        // If text is longer then one line - bottom border of the popup will be hidden
        //      because we can't resize popup correctly.
        setTimeout(function () {
            popupBody.closest('html').classList.add('visible');
            updatePopupSize();
        }, 200);
    };

    /******************************************************************************/

    var handleSearch = function () {
        popupBody.querySelector('.search-input_search-btn').removeEventListener('click', onSearch);
        popupBody.querySelector('.search-input_search-btn').addEventListener('click', onSearch);

        popupBody.querySelector('.search-input > input').removeEventListener('keyup', onSearch);
        popupBody.querySelector('.search-input > input').addEventListener('keyup', onSearch);
    };

    var onSearch = function (ev) {
        if (ev.type === 'click' || (ev.type === 'keyup' && ev.keyCode === 13)) {
            var query = popupBody.querySelector('.search-input > input').value;
            if (!query)
                return;

            vAPI.messaging.send(
                'nudging',
                {
                    what: 'searchQuery',
                    query: query
                }
            );
        }
    };

    /******************************************************************************/

    var handleMenuBtn = function () {
        popupBody.querySelector('.header_btn__menu').removeEventListener('click', onMenuBtnClick);
        popupBody.querySelector('.header_btn__menu').addEventListener('click', onMenuBtnClick);

        popupBody.removeEventListener('click', onBodyClick);
        popupBody.addEventListener('click', onBodyClick);
    };

    var onMenuBtnClick = function (ev) {
        if (isMenuOpened())
            closeMenu();
        else
            openMenu();
    };

    var onBodyClick = function (ev) {
        if (ev.target.classList.contains('menu') || ev.target.closest('.menu')) {
            ev.stopPropagation();
            ev.preventDefault();
            return;
        }


        if (ev.target.classList.contains('header_btn__menu') || ev.target.closest('.header_btn__menu')) {
            return;
        }

        if (isMenuOpened()) {
            ev.stopPropagation();
            ev.preventDefault();
            closeMenu();
        }
    };

    var openMenu = function () {
        elMenu.classList.toggle('menu__active', true);
        updatePopupSize();
    };

    var closeMenu = function () {
        elMenu.classList.toggle('menu__active', false);
        updatePopupSize();
    };

    var isMenuOpened = function () {
        return elMenu.classList.contains('menu__active');
    };

    /******************************************************************************/

    var handleMenuItems = function () {
        popupBody.querySelector('.menu').removeEventListener('click', onMenuItemClick);
        popupBody.querySelector('.menu').addEventListener('click', onMenuItemClick);
    };

    var onMenuItemClick = function (ev) {
        if (!ev.target.classList.contains('menu-item')) {
            return;
        }

        var action = ev.target.getAttribute('data-action');
        switch (action) {
            case 'about':
            case 'settings':
            case 'google_activity':
                openPage(action);
                break;
            case 'minimize':
                minimizeWnd();
                break;
        }

        closeMenu();
    };

    /******************************************************************************/

    var handleGoogleActivityBtn = function () {
        popupBody.querySelector('#check_google_activity').removeEventListener('click', onGoogleActivityBtnClick);
        popupBody.querySelector('#check_google_activity').addEventListener('click', onGoogleActivityBtnClick);
    };

    var onGoogleActivityBtnClick = function (ev) {
        ev.stopPropagation();
        ev.preventDefault();

        openPage('google_activity');
    };

    /******************************************************************************/

    /**
     * Open page in a new tab.
     * @param {string} pageAction - name of a page sent to a background script (e.g. 'about', 'settings')
     */
    var openPage = function (pageAction) {
        vAPI.messaging.send(
            'nudging',
            {
                what: 'openPage',
                action: pageAction || ''
            }
        );
    };

    /******************************************************************************/

    var handleMinimizeBtn = function () {
        popupBody.querySelector('.header_btn__minimize').removeEventListener('click', onMinimizeBtnClick);
        popupBody.querySelector('.header_btn__minimize').addEventListener('click', onMinimizeBtnClick);
    };

    var onMinimizeBtnClick = function (ev) {
        ev.stopPropagation();
        ev.preventDefault();

        minimizeWnd();
    };

    var handleExpandBtnClick = function () {
        popupBody.querySelector('.section[data-section="minimized"] svg').removeEventListener('click', onMinimizeBtnClick);
        popupBody.querySelector('.section[data-section="minimized"] svg').addEventListener('click', onMinimizeBtnClick);
    };

    var minimizeWnd = function () {
        popupBody.classList.toggle('minimized');

        updatePopupSize();

        savePopupState();
    };

    var isMinimized = function () {
        return popupBody.classList.contains('minimized');
    };

    var savePopupState = function () {
        vAPI.messaging.send(
            'nudging',
            {
                what: 'saveState',
                minimized: isMinimized(),
                service: vAPI.nudging.serviceName()
            }
        );
    };

    /******************************************************************************/

    /**
     * Update iframe size according to it's content width/height.
     * Size must be updated after each changes on a page (menu open/close, minimize/expand, ...)
     */
    var updatePopupSize = function () {
        var selector = isMinimized() ?
            '.section[data-section="minimized"]' :
            '.section[data-section="expanded"]';
        var activeSection = popupBody.querySelector(selector);
        elPopup.width  = activeSection.scrollWidth + 10;
        elPopup.height = activeSection.scrollHeight + 10;
    };

    /******************************************************************************/

    // Element.closest('selector') polyfill
    (function() {
        if (!Element.prototype.closest) {
            Element.prototype.closest = function(css) {
                var node = this;

                while (node) {
                    if (node.matches(css)) return node;
                    else node = node.parentElement;
                }
                return null;
            };
        }

    })();

    /******************************************************************************/

    var getSearchQuery = function () {
        var url = new URL(window.location.href);
        try {
            if (url.searchParams) {
                return url.searchParams.get('q');
            }
            else if (url.search) {
                var params = url.search.replace(/^\?/, '').split('&');
                for (var i = 0; i < params.length; i++) {
                    var data = params[i].split('=');
                    if (data[0] === 'q') {
                        return data[1];
                    }
                }
            }
            else {
                return '';
            }
        }
        catch (exception) {
            console.error("Exception in 'getSearchQuery' (nudging.js) :\n\t", exception);
            return '';
        }
    };

    /******************************************************************************/

    var bootstrapPopup = function() {
        elPopup.removeEventListener('load', bootstrapPopup);
        vAPI.shutdown.add(stopPopup);
        vAPI.messaging.send(
            'nudging',
            {
                what: 'getNudgingPopupData',
                url: window.location.href,
                hostname: window.location.hostname,
                query: getSearchQuery(),
                service: vAPI.nudging.serviceName()
            },
            startPopup
        );
    };

    /******************************************************************************/

    elPopup = document.createElement('iframe');
    elPopup.id = POPUP_ID;

    var popupCSSStyle = [
        'background: transparent',
        'border: 0',
        'border-radius: 0',
        'box-shadow: none',
        'display: block',
        'right: 70px',
        'top: 65px',
        'margin: 0',
        'max-height: none',
        'max-width: none',
        'opacity: 1',
        'outline: 0',
        'padding: 0',
        'position: fixed',
        'visibility: visible',
        'z-index: 2147483647',
        ''
    ].join(' !important;');
    elPopup.style.cssText = popupCSSStyle;

    var popupCSS1 = [
        '#' + POPUP_ID + ' {',
        popupCSSStyle,
        '}'
    ].join('\n');
    var popupCSS2 = [
        '[' + POPUP_ID + '-clickblind] {',
        'pointer-events: none !important;',
        '}'
    ].join('\n');

// https://github.com/gorhill/uBlock/issues/1529
//   In addition to inline styles, harden the element picker styles by using
//   dedicated CSS rules.
    vAPI.userStylesheet.add(popupCSS1);
    vAPI.userStylesheet.add(popupCSS2);
    vAPI.userStylesheet.apply();

// https://github.com/gorhill/uBlock/issues/2060
    vAPI.domFilterer.excludeNode(elPopup);

    elPopup.addEventListener('load', bootstrapPopup);
    document.documentElement.appendChild(elPopup);

    /******************************************************************************/

})();

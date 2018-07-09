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

    var POPUP_ID = 'findx-remember-login';

    var elPopup = document.getElementById(POPUP_ID);
    if ( elPopup ) {
        return;
    }

    var popupBody = null;
    var notNowBtn = null;
    var dontAskBtn = null;
    var whitelistBtn = null;

    var serviceName = "";

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

    var safeQuerySelectorAll = function(node, selector) {
        if ( node !== null ) {
            try {
                return node.querySelectorAll(selector);
            } catch (e) {
            }
        }
        return [];
    };

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

    var onDialogClicked = function(ev) {
        if ( ev.isTrusted === false ) { return; }

        else if ( ev.target === null ) {
            /* do nothing */
        }

        else if ( ev.currentTarget.id === 'whitelist' ) {
            vAPI.messaging.send(
                'rememberLogin',
                {
                    what: 'whitelistService',
                    service: serviceName
                }
            );
            stopPopup();
        }

        else if ( ev.currentTarget.id === 'not_now' ) {
            stopPopup();
        }

        else if ( ev.currentTarget.id === 'dont_ask' ) {
            vAPI.messaging.send(
                'rememberLogin',
                {
                    what: 'dontAskAgain',
                    service: serviceName
                }
            );
            stopPopup();
        }

        ev.stopPropagation();
        ev.preventDefault();
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

        notNowBtn.removeEventListener('click', onDialogClicked);
        dontAskBtn.removeEventListener('click', onDialogClicked);
        whitelistBtn.removeEventListener('click', onDialogClicked);
        elPopup.parentNode.removeChild(elPopup);
        elPopup.removeEventListener('load', stopPopup);
        elPopup =
            popupBody =
                notNowBtn =
                    dontAskBtn =
                        whitelistBtn =
                            serviceName = null;
    };

    /******************************************************************************/

    var startPopup = function(details) {
        elPopup.addEventListener('load', stopPopup);

        var frameDoc = elPopup.contentDocument;
        var parsedDom = (new DOMParser()).parseFromString(
            details.frameContent,
            'text/html'
        );

        serviceName = details.serviceName;


        parsedDom.documentElement.id = 'findx-remember-login-popup';

        frameDoc.replaceChild(
            frameDoc.adoptNode(parsedDom.documentElement),
            frameDoc.documentElement
        );

        popupBody = frameDoc.body;
        popupBody.setAttribute('lang', navigator.language);

        notNowBtn = popupBody.querySelector('#not_now');
        notNowBtn.addEventListener('click', onDialogClicked);

        dontAskBtn = popupBody.querySelector('#dont_ask');
        dontAskBtn.addEventListener('click', onDialogClicked);

        whitelistBtn = popupBody.querySelector('#whitelist');
        whitelistBtn.addEventListener('click', onDialogClicked);
    };

    /******************************************************************************/

    var bootstrapPopup = function() {
        elPopup.removeEventListener('load', bootstrapPopup);
        vAPI.shutdown.add(stopPopup);
        vAPI.messaging.send(
            'rememberLogin',
            {
                what: 'rememberLoginArguments',
                url: window.location.href,
                hostname: window.location.hostname
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
        'min-height: 215px',
        'min-width: 340px',
        'right: 50px',
        'top: 50px',
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
        '#' + elPopup.id + ' {',
        popupCSSStyle,
        '}'
    ].join('\n');
    var popupCSS2 = [
        '[' + elPopup.id + '-clickblind] {',
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

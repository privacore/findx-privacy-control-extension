(function () {


    var SuggestionsBox = function () {
        var _itemsData = [];
        var _ddWnd = null;
        var _inputEl = null;

        var SUGGESTIONS = [
            // Shopping
            {prefix: "!auk", title: "Amazon.co.uk"},
            {prefix: "!a", title: "Amazon.com"},
            {prefix: "!euk", title: "Ebay.co.uk"},
            {prefix: "!e", title: "Ebay.com"},
            {prefix: "!s", title: "findx Shopping"},

            // Search
            {prefix: "!bd", title: "Baidu"},
            {prefix: "!b", title: "Bing"},
            {prefix: "!ddg", title: "DuckDuckGo"},
            {prefix: "!g", title: "Google"},
            {prefix: "!gau", title: "Google Australia"},
            {prefix: "!gbe", title: "Google Belgien"},
            {prefix: "!gca", title: "Google Canada"},
            {prefix: "!gcz", title: "Google \u010cesk\u00e1 republika"},
            {prefix: "!gcy", title: "Google Cipru"},
            {prefix: "!gdk", title: "Google Danmark"},
            {prefix: "!gde", title: "Google Deutschland"},
            {prefix: "!gee", title: "Google Eesti"},
            {prefix: "!ges", title: "Google Espa\u00f1a"},
            {prefix: "!gfr", title: "Google France"},
            {prefix: "!ghg", title: "Google Hrvatska"},
            {prefix: "!gie", title: "Google Ireland"},
            {prefix: "!git", title: "Google Italia"},
            {prefix: "!glv", title: "Google Latvija"},
            {prefix: "!glt", title: "Google Lietuva"},
            {prefix: "!glu", title: "Google Luxemburg"},
            {prefix: "!ghu", title: "Google Magyarorsz\u00e1g"},
            {prefix: "!gmt", title: "Google Malta"},
            {prefix: "!gnl", title: "Google Nederland"},
            {prefix: "!gno", title: "Google Norge"},
            {prefix: "!gat", title: "Google \u00d6sterreich"},
            {prefix: "!gpl", title: "Google Polska"},
            {prefix: "!gpt", title: "Google Portugal"},
            {prefix: "!gro", title: "Google Rom\u00e2nia"},
            {prefix: "!gch", title: "Google Schweiz"},
            {prefix: "!gsi", title: "Google Slovenija"},
            {prefix: "!gsk", title: "Google Slovensko"},
            {prefix: "!gfi", title: "Google Suomi"},
            {prefix: "!gse", title: "Google Sverige"},
            {prefix: "!guk", title: "Google UK"},
            {prefix: "!ggr", title: "Google \u0395\u03bb\u03bb\u03ac\u03b4\u03b1"},
            {prefix: "!gbg", title: "Google \u0411\u044a\u043b\u0433\u0430\u0440\u0438\u044f"},
            {prefix: "!wolf", title: "Wolfram Alpha"},
            {prefix: "!y", title: "Yahoo"},
            {prefix: "!y.de", title: "Yahoo Deutschland"},
            {prefix: "!ya", title: "Yandex"},

            // Images
            {prefix: "!bi", title: "Bing Images"},
            {prefix: "!i", title: "findx Image Search"},
            {prefix: "!f", title: "Flickr"},
            {prefix: "!gi", title: "Google Images"},
            {prefix: "!yi", title: "Yahoo Images"},
            {prefix: "!yai", title: "Yandex Images"},

            // Maps
            {prefix: "!bm", title: "Bing Maps"},
            {prefix: "!m", title: "findx Maps"},
            {prefix: "!gm", title: "Google Maps"},
            {prefix: "!here", title: "Here Maps"},
            {prefix: "!osm", title: "Open Street Map"},
            {prefix: "!ym", title: "Yahoo Maps"},
            {prefix: "!yam", title: "Yandex Maps"},

            // Videos
            {prefix: "!bv", title: "Bing Videos"},
            {prefix: "!v", title: "findx Video Search"},
            {prefix: "!vi", title: "Vimeo"},
            {prefix: "!yav", title: "Yandex Videos"},
            {prefix: "!yt", title: "Youtube"},

            // Social
            {prefix: "!fb", title: "Facebook"},
            {prefix: "!ins", title: "Instagram"},
            {prefix: "!li", title: "Linkedin"},
            {prefix: "!p", title: "Pinterest"},
            {prefix: "!r", title: "Reddit"},
            {prefix: "!t", title: "Twitter"},

            // Information Portals
            {prefix: "!q", title: "Quora"},
            {prefix: "!so", title: "Stack overflow"},
            {prefix: "!w", title: "Wikipedia"},
            {prefix: "!wcz", title: "Wikipedia \u010desk\u00e1"},
            {prefix: "!wdk", title: "Wikipedia dansk"},
            {prefix: "!wde", title: "Wikipedia deutsch"},
            {prefix: "!wet", title: "Wikipedia eesti"},
            {prefix: "!wen", title: "Wikipedia english"},
            {prefix: "!wes", title: "Wikipedia espa\u00f1ol"},
            {prefix: "!wfr", title: "Wikipedia fran\u00e7ais"},
            {prefix: "!wgl", title: "Wikipedia galego"},
            {prefix: "!whr", title: "Wikipedia hrvatski"},
            {prefix: "!wit", title: "Wikipedia italiano"},
            {prefix: "!wlv", title: "Wikipedia Latvijas"},
            {prefix: "!wlb", title: "Wikipedia l\u00ebtzebuerger"},
            {prefix: "!wlt", title: "Wikipedia Lietuvos"},
            {prefix: "!whu", title: "Wikipedia magyar"},
            {prefix: "!wmt", title: "Wikipedia maltese"},
            {prefix: "!wnl", title: "Wikipedia nederlands"},
            {prefix: "!wno", title: "Wikipedia norsk"},
            {prefix: "!wpl", title: "Wikipedia polskie"},
            {prefix: "!wpt", title: "Wikipedia portugu\u00eas"},
            {prefix: "!wro", title: "Wikipedia rom\u00e2n\u0103"},
            {prefix: "!wsl", title: "Wikipedia slovenski"},
            {prefix: "!wsk", title: "Wikipedia slovensk\u00fd"},
            {prefix: "!wfi", title: "Wikipedia suomalainen"},
            {prefix: "!wsv", title: "Wikipedia svensk"},
            {prefix: "!wel", title: "Wikipedia \u03b5\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac"},
            {prefix: "!wbg", title: "Wikipedia \u0431\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438"},

            // Tools
            {prefix: "!who", title: "Who.is"}
        ];


        var init = function() {};

        var setWrapper = function (wrap) {
            if (wrap && typeof wrap === "string") {
                _ddWnd = $(wrap); // received id of wrapper
            }
            else if (wrap && typeof wrap === "object" && wrap.length) {
                _ddWnd = $(wrap); // jQuery object
            }
        };

        var setInputEl = function (input) {
            if (input && typeof input === "string") {
                _inputEl = $(input); // received id of wrapper
            }
            else if (input && typeof input === "object" && input.length) {
                _inputEl = $(input); // jQuery object
            }

            handleInputEl();
        };

        var setInputElValue = function (str) {
            _inputEl.val(str);
        };
        var isInputEmpty = function () {
            return !_inputEl.val();
        };

        var handleInputEl = function () {
            _inputEl.off("keyup");
            _inputEl.on("keyup", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();

                if (ev.which !== 38 && ev.which !== 40 && ev.which !== 13 && ev.which !== 27) {
                    setTimeout(function () {
                        var val = _inputEl.val();
                        updateSuggestion(val);
                    }, 0);
                }
            });
            _inputEl.off("keydown");
            _inputEl.on("keydown", function (ev) {
                if (ev.which == 13) { // ENTER key
                    var highlightedEl = getHighlightedSuggestion();
                    if (highlightedEl.length) { // suggestions dd wnd opened
                        ev.preventDefault();
                        ev.stopPropagation();
                        selectSuggestion(highlightedEl);
                    }
                    else if (isUrl(_inputEl.val())) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openUrl(_inputEl.val());
                    }
                }
                else if (ev.which == 27) { // ESC
                    hideDdWrap();
                }
                else if (ev.which == 38) { // ArrowUp
                    ev.preventDefault();
                    ev.stopPropagation();
                    moveThrowSuggestions(false);
                }
                else if (ev.which == 40) { // ArrowDown
                    ev.preventDefault();
                    ev.stopPropagation();
                    moveThrowSuggestions(true);
                }
            });


            $(".autosuggest__clearBtn").off("click");
            $(".autosuggest__clearBtn").on("click", function (ev) {
                ev.stopPropagation();
                ev.preventDefault();
                clearInputVal();
            });

            _inputEl.off("focusin");
            _inputEl.on("focusin", function (ev) {
                focusChanged(true);
            });

            _inputEl.off("focusout");
            _inputEl.on("focusout", function (ev) {
                focusChanged(false);
            });
        };


        var clearInputVal = function () {
            hideDdWrap();
            setInputElValue("");
            focusChanged();
        };

        var focusChanged = function (isFocused) {
            if (isFocused && !isInputEmpty()) {
                //$(".autosuggest__input-container").addClass("autosuggest__input-container--focused");
                $(".searchBar__btn").addClass("searchBar__btn--active");
                $(".autosuggest__clearBtn").addClass("autosuggest__clearBtn--active");
            }
            else {
                //$(".autosuggest__input-container").removeClass("autosuggest__input-container--focused");
                $(".searchBar__btn").removeClass("searchBar__btn--active");
                $(".autosuggest__clearBtn").removeClass("autosuggest__clearBtn--active");
            }

            if (isInputEmpty()) {
                $(".autosuggest__clearBtn").addClass("hidden-btn");
            }
            else {
                $(".autosuggest__clearBtn").removeClass("hidden-btn");
            }
        };

        var injectControl = function (ddWrapper, inputEl) {
            if (ddWrapper) setWrapper(ddWrapper);
            if (inputEl) setInputEl(inputEl);
        };

        var fillDdWnd = function () {
            if (!_ddWnd || !_ddWnd.length) return;

            _ddWnd.html("");

            _itemsData.forEach(function (item) {
                _ddWnd.append(createDdMenuItem(item));
            });
        };

        var createDdMenuItem = function (data) {
            var item = null;

            item =
                '<li data-input-val="{{input_val}}" role="option" class="dd-menu-item react-autosuggest__suggestion">' +
                    '<div class="react-autosuggest__suggestion_inner">' +
                        '<span>' +
                            '<strong class="highlight">{{prefix}}</strong>' +
                            '<span> - </span>' +
                            '<span>{{title}}</span>' +
                        '</span>' +
                    '</div>' +
                '</li>';
            item = item
                .replace(/\{\{prefix\}\}/g, data.prefix)
                .replace(/\{\{input_val\}\}/g, data.prefix)
                .replace(/\{\{title\}\}/g, data.title);

            item = $(item);

            item.click(function (ev) {
                selectSuggestion(item);
            });
            item.hover(function (ev) {
                changeHighlighted(getHighlightedSuggestion(), $(ev.currentTarget));
            });

            return item;
        };

        var selectSuggestion = function (itemEl) {
            hideDdWrap();

            var itemVal = $(itemEl).data("input-val");
            setInputElValue(itemVal + " ");
            _inputEl.focus();
        };


        var moveThrowSuggestions = function (isDown) {
            moveHighlighting(isDown);

            var selectedItem = getHighlightedSuggestion();

            // Set selected item's text to input element
            if (selectedItem && selectedItem.length) {
                var itemData = selectedItem.data("input-val");
                itemData += " ";
                setInputElValue(itemData);
            }
        };

        var getHighlightedSuggestion = function () {
            return _ddWnd.find(".react-autosuggest__suggestion--focused");
        };

        /**
         * Change highlighted suggestion by arrow keys.
         * @param {boolean} isDown
         */
        var moveHighlighting = function (isDown) {
            var selectedItem = getHighlightedSuggestion();
            var sibling = null;

            if (selectedItem && selectedItem.length) {
                sibling = isDown ? selectedItem.next() : selectedItem.prev();

                if (sibling && sibling.length) {
                    changeHighlighted(selectedItem, sibling);
                }
            }
            else { // no one element highlighted
                selectedItem = $(_ddWnd.find('.dd-menu-item')[0]);
                if (selectedItem && selectedItem.length) {
                    changeHighlighted(null, selectedItem);
                }
            }
        };

        var changeHighlighted = function (from, to) {
            if (from && from.length) from.removeClass('react-autosuggest__suggestion--focused');
            else removeHighlighting();

            if (to && to.length) to.addClass('react-autosuggest__suggestion--focused');
        };

        var removeHighlighting = function () {
            getHighlightedSuggestion().removeClass('react-autosuggest__suggestion--focused');
        };


        var updateSuggestion = function (str) {
            if (!str) {
                hideDdWrap();
                focusChanged();
                return;
            }

            focusChanged(true);

            if (str.indexOf("!") == 0) {
                getSuggestionsByExclamationMark(str, itemsReceived);
            }
            else {
                hideDdWrap();
            }

            function itemsReceived (items) {
                if (items && items.length && !isInputEmpty()) {
                    _itemsData = items;
                    fillDdWnd();
                    showDdWrap();
                }
                else {
                    hideDdWrap();
                }
            }
        };

        var getSuggestionsByExclamationMark = function (str, callback) {
            var allItems = SUGGESTIONS;

            if (!str) return [];

            var arr = allItems.filter(function (item) {
                return item.prefix.indexOf(str) == 0;
            });

            if (arr && arr.length > 5) {
                arr = arr.slice(0, 5);
            }

            if (callback) callback(arr);
        };

        /**
         * Highlight characters in title and in urls that equals to query string.
         * @param {string} q
         * @param {Object[]} data
         */
        var highlightQueryInData = function (q, data) {
            data.forEach(function (item) {
                item.highlightedTitle = highlightQueryInString(q, item.title);
                item.highlightedUrl = highlightQueryInString(q, item.url);
            });
            return data;
        };
        var highlightQueryInString = function (q, str) {
            var regEx = new RegExp("(" + q + ")", "ig");

            str = str.replace(regEx, '<b class="highlighted-query">$1</b>');

            return str;
        };


        var showDdWrap = function () {
            _ddWnd.show();
        };
        var hideDdWrap = function () {
            _ddWnd.hide();

            removeHighlighting();
        };


        var isUrl = function (str) {
            try {
                return validator.isURL(str);
            }
            catch (exception) {
                console.error("Exception in 'isUrl' (newTab.js) :\n\t", exception);
            }
        };

        var openUrl = function (url) {
            try {
                url = /^(http|https):/.test(url) ? url : 'http://' + url;
                document.location.href = url;

                hideDdWrap();
            }
            catch (exception) {
                console.error("Exception in 'openUrl' (newTab.js) :\n\t", exception);
            }
        };


        init();

        return {
            inject: injectControl,
            update: updateSuggestion,
            show: showDdWrap,
            hide: hideDdWrap,
            set inputEl (val) {
                setInputEl(val);
            }
        };
    };



    var _suggBox = null;

    var ready = function () {
        _suggBox = new SuggestionsBox();
        _suggBox.inject($("#auto_suggestions_wrap"), $("#search_input"));
    };


    $(document).ready(ready);
})();
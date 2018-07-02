/**
 * @file

 * @author Igor Petrenko
 * @date  6/19/2018
 */

"use strict";

(function () {


var presets = {
    children: {
        filters: {
            ads: false,
            privacy: false,
            malware: false,
            facebook: false,
            google: false,
            adult: false
        },
        cookiesSettings: {
            'thirdPartyCookiesBlocking': true,
            'periodicalClearing': true
        }
    },
    standard: {
        cookiesSettings: {
            'thirdPartyCookiesBlocking': true,
            'periodicalClearing': false
        }
    },
    custom: {
        filters: {
            ads: true,
            privacy: false,
            malware: false,
            facebook: false,
            google: false,
            adult: true
        },
        cookiesSettings: {
            'thirdPartyCookiesBlocking': true,
            'periodicalClearing': false
        }
    }
};

/******************************************************************************/

/**
 * Fill default settings values on page load.
 */
var fillPresets = function () {
    for (var plan in presets) {
        if (plan === 'children')
            continue;

        for (var group in presets[plan]) {
            for (var setting in presets[plan][group]) {
                setDefaultSettingValue(plan, group, setting, presets[plan][group][setting]);
            }
        }
    }
};

var setDefaultSettingValue = function (plan, group, setting, value) {
    var elSetting = document.querySelector('.page-tab[data-page="' + plan + '"] ' +
        '.switchers-block__group[data-group="' + group + '"] ' +
        '.switcher-item[data-setting="' + setting + '"]');

    // Some switchers can have few values in a 'data-setting' attribute (facebook/google, privacy/malware)
    if (!elSetting) {
        var elGroup = document.querySelector('.page-tab[data-page="' + plan + '"] ' +
            '.switchers-block__group[data-group="' + group + '"] ');
        if (!elGroup)
            return;

        var groupSwitchers = elGroup.querySelectorAll('.switcher-item');
        for (var i = 0; i < groupSwitchers.length; i++) {
            var elSwitcher = groupSwitchers[i];
            var settingAttr = elSwitcher.getAttribute('data-setting');
            if (settingAttr.indexOf('/') !== -1) // If one switcher used for multiple groups (facebook/google)
                settingAttr = settingAttr.split('/');
            else {
                // If it is not a list of settings - continue searching.
                continue;
            }

            // Correct switcher found
            if (settingAttr.indexOf(setting) !== -1) {
                elSetting = elSwitcher;
                break;
            }
        }

        if (!elSwitcher)
            return;
    }

    // Settings in 'Filters' group used for setting 'defaultOff' property for filters.
    // So when switcher is enabled - we need to set 'defaultOff' property to false.
    // It means that we need to revert value before using it
    if (group === 'filters') {
        value = !value;
    }

    if (value)
        elSetting.querySelector('input[type="checkbox"]').setAttribute('checked', value);
    else
        elSetting.querySelector('input[type="checkbox"]').removeAttribute('checked');
};

/******************************************************************************/

var handleMainCards = function () {
    var cards = document.querySelectorAll('.card');
    cards.forEach(function (card) {
        try {
            card.addEventListener('click', onCardClick);
        }
        catch (exception) {
            console.error("Exception in 'handleMainCards' (onboarding.js) :\n\t", exception);
        }
    });
};

var onCardClick = function (ev) {
    if (ev.target.nodeName === 'A') {
        // Don't open card page if link in a card content was clicked.
        return;
    }

    var cardName = ev.currentTarget.getAttribute('data-card-name');
    switch (cardName) {
        case 'children':
            selectPlan(cardName);
            break;
        case 'standard':
            isSafari() ? selectPlan(cardName) : window.location.hash = cardName;
            break;
        case 'custom':
            window.location.hash = cardName;
            break;
    }
};

/******************************************************************************/

/**
 * Select one plan from: children, standard, custom
 * @param {string} plan - plan name
 */
var selectPlan = function (plan) {
    var planData = presets[plan];
    if (plan === 'main' || !plan) {
        // Set "For children" by default
        planData = presets.children;
    }

    vAPI.messaging.send('onboarding', {
        what: 'setPresetSettings',
        data: planData
    });

    window.location.href = 'https://get.findx.com/privacycontrol/thankyou';
};

/******************************************************************************/

var handlePageControls = function () {
    var backBtns = document.querySelectorAll('.back-button');
    backBtns.forEach(function (btn) {
        btn.addEventListener('click', onBackBtnClick);
    });

    var continueBtns = document.querySelectorAll('.continue-button');
    continueBtns.forEach(function (btn) {
        btn.addEventListener('click', onContinueBtnClick);
    });
};


var onBackBtnClick = function (ev) {
    window.location.hash = 'main';
};

var onContinueBtnClick = function (ev) {
    selectPlan(window.location.hash.slice(1));
};

/******************************************************************************/

var handleSettingsItems = function () {
    var elItems = document.querySelectorAll('.switcher-item input[type="checkbox"]');
    if (!elItems) return;

    elItems.forEach(function (input) {
        input.removeEventListener('change', onSettingSwitcherChanged);
        input.addEventListener('change', onSettingSwitcherChanged);
    });
};

var onSettingSwitcherChanged = function (ev) {
    var value = ev.currentTarget.checked;
    var setting = ev.currentTarget.closest('.switcher-item').getAttribute('data-setting');
    if (setting.indexOf('/') !== -1) // If one switcher used for multiple groups (facebook/google)
        setting = setting.split('/');
    var group = ev.currentTarget.closest('.switchers-block__group').getAttribute('data-group');
    var plan = window.location.hash.slice(1);
    if (!presets[plan])
        return;

    // Settings in 'Filters' group used for setting 'defaultOff' property for filters.
    // So when switcher is enabled - we need to set 'defaultOff' property to false.
    // It means that we need to revert value before setting it to presets object
    if (group === 'filters') {
        value = !value;
    }

    if (typeof setting === 'string')
        presets[plan][group][setting] = value;
    else {
        setting.forEach(function (settingName) {
            presets[plan][group][settingName] = value;
        });
    }
};

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

var onHashChanged = function () {
    var page = window.location.hash.slice(1);
    if ( !page ) {
        page = 'main';
    }
    showActivePage(page);
};

var showActivePage = function (pageName) {
    if (pageName !== 'main' && pageName !== 'standard' && pageName !== 'custom')
        pageName = 'main';
    if (isSafari() && pageName === 'standard')
        pageName = 'main';

    document.querySelectorAll('.page-tab').forEach(function (page) {
        page.classList.toggle('active', (page.getAttribute('data-page') === pageName));
    });
};

/******************************************************************************/

var isSafari = function() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};


uDom.onLoad(function() {
    onHashChanged();
    if (("onhashchange" in window)) {
        window.onhashchange = onHashChanged;
    }

    document.querySelector('body').classList.toggle('safari-browser', isSafari());

    handleMainCards();
    handlePageControls();

    fillPresets();
    handleSettingsItems();

    // var cards = document.querySelectorAll('.card-selection');
    // cards.forEach(function (card) {
    //     mdc.ripple.MDCRipple.attachTo(card);
    //     mdc.foo.MDCFoo.attachTo(document.querySelector('.mdc-foo'));
    // });
});

})();
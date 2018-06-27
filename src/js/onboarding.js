/**
 * @file

 * @author Igor Petrenko
 * @date  6/19/2018
 */

"use strict";

(function () {




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
    //TODO: send settings values to bg
    window.location.href = 'newTab.html';
};

/******************************************************************************/

var showActivePage = function (pageName) {
    if (pageName !== 'main' && pageName !== 'standard' && pageName !== 'custom')
        pageName = 'main';
    document.querySelectorAll('.page-tab').forEach(function (page) {
        page.classList.toggle('active', (page.getAttribute('data-page') === pageName));
    });
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

var onHashChanged = function () {
    var page = window.location.hash.slice(1);
    if ( !page ) {
        page = 'main';
    }
    showActivePage(page);
};

uDom.onLoad(function() {
    onHashChanged();
    if (("onhashchange" in window)) {
        window.onhashchange = onHashChanged;
    }

    handleMainCards();
    handlePageControls();

    // var cards = document.querySelectorAll('.card-selection');
    // cards.forEach(function (card) {
    //     mdc.ripple.MDCRipple.attachTo(card);
    //     mdc.foo.MDCFoo.attachTo(document.querySelector('.mdc-foo'));
    // });
});

})();
/**
 * @file

 * @author Igor Petrenko
 * @date  2/23/2018
 */

"use strict";

(function () {

    var _sideNav = null;
    var _mainTabs = null;

    var initializeControls = function () {
        let elSideNav = document.querySelector('.sidenav');
        _sideNav = M.Sidenav.init(elSideNav, {
            draggable: false
        });


        // let elMainPageTabs = document.querySelector('.main-content .tabs');
        // _mainTabs = M.Tabs.init(elMainPageTabs);
        // _mainTabs.select("protection_tab");

        handleMainPageTabs();


    };

    var handleMainPageTabs = function () {
        let elMainPageTabs = $('.main-content .tabs .tab a');
        let elTabFrames = $('.tab-frame');
        elMainPageTabs.on("click", function (ev) {
            ev.stopPropagation();
            ev.preventDefault();

            let tabId = $(ev.currentTarget).attr('data-id');
            elTabFrames.removeClass('active');
            $("#" + tabId).addClass('active');
            elMainPageTabs.removeClass('active');
            $(ev.currentTarget).addClass('active');
        })
    };





    // Make menu only when popup html is fully loaded
    uDom.onLoad(function () {
        initializeControls();
    });

})();
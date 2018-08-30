/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-2017 Raymond Hill

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

/******************************************************************************/

var handleImportFilePicker = function() {
    var file = this.files[0];
    if ( file === undefined || file.name === '' ) {
        return;
    }
    if ( file.type.indexOf('text') !== 0 ) {
        return;
    }
    var filename = file.name;

    var fileReaderOnLoadHandler = function() {
        var userData;
        try {
            userData = JSON.parse(this.result);
            if ( typeof userData !== 'object' ) {
                throw 'Invalid';
            }
            if ( typeof userData.userSettings !== 'object' ) {
                throw 'Invalid';
            }
            if ( typeof userData.netWhitelist !== 'string' ) {
                throw 'Invalid';
            }
            if (
                typeof userData.filterLists !== 'object' &&
                Array.isArray(userData.selectedFilterLists) === false
            ) {
                throw 'Invalid';
            }
        }
        catch (e) {
            userData = undefined;
        }
        if ( userData === undefined ) {
            window.alert(vAPI.i18n('aboutRestoreDataError'));
            return;
        }
        var time = new Date(userData.timeStamp);
        var msg = vAPI.i18n('aboutRestoreDataConfirm')
                      .replace('{{time}}', time.toLocaleString());
        var proceed = window.confirm(msg);
        if ( proceed ) {
            messaging.send(
                'dashboard',
                {
                    what: 'restoreUserData',
                    userData: userData,
                    file: filename
                }
            );
        }
    };

    var fr = new FileReader();
    fr.onload = fileReaderOnLoadHandler;
    fr.readAsText(file);
};

/******************************************************************************/

var startImportFilePicker = function() {
    var input = document.getElementById('restoreFilePicker');
    // Reset to empty string, this will ensure an change event is properly
    // triggered if the user pick a file, even if it is the same as the last
    // one picked.
    input.value = '';
    input.click();
};

/******************************************************************************/

var exportToFile = function() {
    messaging.send('dashboard', { what: 'backupUserData' }, function(response) {
        if (
            response instanceof Object === false ||
            response.userData instanceof Object === false
        ) {
            return;
        }
        vAPI.download({
            'url': 'data:text/plain;charset=utf-8,' +
                   encodeURIComponent(JSON.stringify(response.userData, null, '  ')),
            'filename': response.localData.lastBackupFile
        });
        onLocalDataReceived(response.localData);
    });
};

/******************************************************************************/

var onLocalDataReceived = function(details) {
    uDom('#localData > ul > li:nth-of-type(1)').text(
        vAPI.i18n('settingsStorageUsed')
            .replace(
                '{{value}}',
                typeof details.storageUsed === 'number' ? details.storageUsed.toLocaleString() : '?'
            )
    );

    var elem, dt;
    var timeOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        timeZoneName: 'short'
    };
    var lastBackupFile = details.lastBackupFile || '';
    if ( lastBackupFile !== '' ) {
        dt = new Date(details.lastBackupTime);
        uDom('#localData > ul > li:nth-of-type(2) > ul > li:nth-of-type(1)').text(dt.toLocaleString('fullwide', timeOptions));
        //uDom('#localData > ul > li:nth-of-type(2) > ul > li:nth-of-type(2)').text(lastBackupFile);
        uDom('#localData > ul > li:nth-of-type(2)').css('display', '');
    }

    var lastRestoreFile = details.lastRestoreFile || '';
    elem = uDom('#localData > p:nth-of-type(3)');
    if ( lastRestoreFile !== '' ) {
        dt = new Date(details.lastRestoreTime);
        uDom('#localData > ul > li:nth-of-type(3) > ul > li:nth-of-type(1)').text(dt.toLocaleString('fullwide', timeOptions));
        uDom('#localData > ul > li:nth-of-type(3) > ul > li:nth-of-type(2)').text(lastRestoreFile);
        uDom('#localData > ul > li:nth-of-type(3)').css('display', '');
    }

    if ( details.cloudStorageSupported === false ) {
        uDom('#cloud-storage-enabled').attr('disabled', '');
    }
    if ( details.privacySettingsSupported === false ) {
        uDom('#prefetching-disabled').attr('disabled', '');
        uDom('#hyperlink-auditing-disabled').attr('disabled', '');
        uDom('#webrtc-ipaddress-hidden').attr('disabled', '');
    }
};

/******************************************************************************/

var resetUserData = function() {
    var msg = vAPI.i18n.prepareTemplateText(vAPI.i18n('aboutResetDataConfirm'));
    var proceed = window.confirm(msg);
    if ( proceed ) {
        messaging.send('dashboard', { what: 'resetUserData' });
    }
};

/******************************************************************************/

var synchronizeDOM = function() {
    document.body.classList.toggle(
        'advancedUser',
        uDom.nodeFromId('advanced-user-enabled').checked === true
    );
};

/******************************************************************************/

var changeUserSettings = function(name, value) {
    messaging.send(
        'dashboard',
        {
            what: 'userSettings',
            name: name,
            value: value
        }
    );
};

/******************************************************************************/

var onInputChanged = function(ev) {
    var input = ev.target;
    var name = this.getAttribute('data-setting-name');
    var value = input.value;
    if ( name === 'largeMediaSize' ) {
        value = Math.min(Math.max(Math.floor(parseInt(value, 10) || 0), 0), 1000000);
    }
    if ( value !== input.value ) {
        input.value = value;
    }
    changeUserSettings(name, value);
};

/******************************************************************************/

// Workaround for:
// https://github.com/gorhill/uBlock/issues/1448

var onPreventDefault = function(ev) {
    ev.target.focus();
    ev.preventDefault();
};

/******************************************************************************/

    var handleCheckboxes = function () {
        $("div[type='checkbox']").on("mouseup", function (ev) {
            $(this).toggleClass("checked");
        });
    };

    var toggleCheckbox = function (checkbox, val) {
        try {
            if (val)
                $(checkbox).addClass("checked");
            else
                $(checkbox).removeClass("checked");
        }
        catch (exception) {
            console.error("Exception in 'toggleCheckbox' (settings.js) :\n\t", exception);
        }
    };

    var isChecked = function (checkbox) {
        return $(checkbox).hasClass("checked");
    };

/******************************************************************************/

// TODO: use data-* to declare simple settings

var onUserSettingsReceived = function(details) {
    uDom('[data-setting-type="bool"]').forEach(function(uNode) {
        toggleCheckbox(uNode.nodes[0], details[uNode.attr('data-setting-name')] === true);
        uNode.on('click', function() {
            changeUserSettings(
                this.getAttribute('data-setting-name'),
                isChecked(this)
            );
            //synchronizeDOM();
        });
    });

    uDom('[data-setting-name="noLargeMedia"] ~ label:first-of-type > input[type="number"]')
        .attr('data-setting-name', 'largeMediaSize')
        .attr('data-setting-type', 'input');

    uDom('[data-setting-type="input"]').forEach(function(uNode) {
        uNode.val(details[uNode.attr('data-setting-name')])
             .on('change', onInputChanged)
             .on('click', onPreventDefault);
    });

    uDom('#export').on('click', exportToFile);
    uDom('#import').on('click', startImportFilePicker);
    uDom('#reset').on('click', resetUserData);
    uDom('#restoreFilePicker').on('change', handleImportFilePicker);

    //synchronizeDOM();
};

/******************************************************************************/

var onCookiesSettingsReceived = function (details) {
    uDom('.cookies-settings [data-setting-type="bool"]').forEach(function(uNode) {
        toggleCheckbox(uNode.nodes[0], details[uNode.attr('data-setting-name')] === true);
        uNode.on('click', function() {
            changeCookiesSettings(
                this.getAttribute('data-setting-name'),
                isChecked(this)
            );
        });
    });

    uDom('input[data-setting-name="clearingPeriod"]').forEach(function(uNode) {
        var value = details[uNode.attr('data-setting-name')];
        // Convert milliseconds to minutes
        value = value / 60000;
        uNode.val(value)
            .on('change', onClearIntervalChanged)
            .on('click', onPreventDefault);
    });
};

var changeCookiesSettings = function(name, value) {
    messaging.send(
        'dashboard',
        {
            what: 'changeCookiesSettings',
            name: name,
            value: value
        }
    );
};

var onClearIntervalChanged = function(ev) {
    var input = ev.target;
    var name = this.getAttribute('data-setting-name');
    var value = input.value;
    value = Math.min(Math.max(Math.floor(parseInt(value, 10) || 0), 0), 1000000);
    if ( value !== input.value ) {
        input.value = value;
    }

    if (value > 1440) { // maximum interval is 24 hours
        value = 1440;
        input.value = value;
    }

    // Convert minutes to milliseconds
    value = value * 60000;

    changeCookiesSettings(name, value);
};

/******************************************************************************/

var niceScroll = function () {
    $(".body").niceScroll({cursorcolor:"#49854F", autohidemode: false});
};

/******************************************************************************/

var isSafari = function() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

/******************************************************************************/

uDom.onLoad(function() {
    if (isSafari()) {
        $('.cookies-settings').hide();
    }

    handleCheckboxes();
    messaging.send('dashboard', { what: 'userSettings' }, onUserSettingsReceived);
    messaging.send('dashboard', { what: 'getLocalData' }, onLocalDataReceived);
    messaging.send('dashboard', { what: 'cookiesSettings' }, onCookiesSettingsReceived);

    niceScroll();
});

/******************************************************************************/

})();

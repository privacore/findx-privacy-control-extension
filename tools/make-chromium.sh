#!/usr/bin/env bash
#
# This script assumes a linux environment

echo "*** FindxPrivacyControl.ch: Creating web store package"
echo "*** FindxPrivacyControl.ch: Copying files"


DES=dist/build/FindxPrivacyControl.ch
rm -rf $DES
mkdir -p $DES

bash ./tools/make-assets.sh $DES
bash ./tools/remove-nonfindx-localizations.sh

cp -R src/css               $DES/
cp -R src/img               $DES/
cp -R src/js                $DES/
cp -R src/lib               $DES/
cp -R src/_locales          $DES/
cp src/*.html               $DES/
cp platform/chromium/*.js   $DES/js/
cp -R platform/chromium/img $DES/
cp platform/chromium/*.html $DES/
cp platform/chromium/*.json $DES/
cp LICENSE.txt              $DES/

echo "*** FindxPrivacyControl.ch: concatenating content scripts"
cat $DES/js/vapi-usercss.js > /tmp/contentscript.js
echo >> /tmp/contentscript.js
grep -v "^'use strict';$" $DES/js/contentscript.js >> /tmp/contentscript.js
mv /tmp/contentscript.js $DES/js/contentscript.js
rm $DES/js/vapi-usercss.js

# Chrome store-specific
if [ -d $DES/_locales/nb ]; then
	cp -R $DES/_locales/nb      $DES/_locales/no
fi

echo "*** FindxPrivacyControl.ch: Generating meta..."
python tools/make-chromium-meta.py $DES/

if [ "$1" = all ]; then
    echo "*** FindxPrivacyControl.ch: Creating package..."
    pushd $(dirname $DES/) > /dev/null
    zip $(basename $DES).zip -qr $(basename $DES/)/*
    popd > /dev/null
fi

echo "*** FindxPrivacyControl.ch: Package done."

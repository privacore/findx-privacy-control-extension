#!/usr/bin/env bash
#
# This script assumes a linux environment

echo "*** PrivacyControl.ch: Creating web store package"
echo "*** PrivacyControl.ch: Copying files"


DES=dist/build/PrivacyControl.ch
rm -rf $DES
mkdir -p $DES

bash ./tools/make-assets.sh $DES

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

echo "*** PrivacyControl.ch: concatenating content scripts"
cat $DES/js/vapi-usercss.js > /tmp/contentscript.js
echo >> /tmp/contentscript.js
grep -v "^'use strict';$" $DES/js/contentscript.js >> /tmp/contentscript.js
mv /tmp/contentscript.js $DES/js/contentscript.js
rm $DES/js/vapi-usercss.js

# Chrome store-specific
cp -R $DES/_locales/nb      $DES/_locales/no

echo "*** PrivacyControl.ch: Generating meta..."
python tools/make-chromium-meta.py $DES/

if [ "$1" = all ]; then
    echo "*** PrivacyControl.ch: Creating package..."
    pushd $(dirname $DES/) > /dev/null
    zip uBlock0.chromium.zip -qr $(basename $DES/)/*
    popd > /dev/null
fi

echo "*** PrivacyControl.ch: Package done."

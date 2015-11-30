#!/bin/bash
#
# This script assumes a linux environment

echo "*** PrivaControl.ch: Creating web store package"
echo "*** PrivaControl.ch: Copying files"

DES=dist/build/PrivaControl.ch
rm -rf $DES
mkdir -p $DES

cp -R assets $DES/
rm $DES/assets/*.sh
cp -R src/css $DES/
cp -R src/img $DES/
cp -R src/js $DES/
cp -R src/lib $DES/
cp -R src/_locales $DES/
cp -R $DES/_locales/nb $DES/_locales/no
cp src/*.html $DES/
cp platform/chromium/*.js $DES/js/
cp -R platform/chromium/img $DES/
cp platform/chromium/*.html $DES/
cp platform/chromium/*.json $DES/
cp LICENSE.txt $DES/

if [ "$1" = all ]; then
    echo "*** PrivaControl.chromium: Creating package..."
    pushd $(dirname $DES/)
    zip uBlock0.chromium.zip -qr $(basename $DES/)/*
    popd
fi

echo "*** PrivaControl.ch: Package done."

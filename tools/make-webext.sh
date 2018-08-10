#!/usr/bin/env bash
#
# This script assumes a linux environment

echo "*** FindxPrivacyControl.webext: Creating web store package"
echo "*** FindxPrivacyControl.webext: Copying files"

DES=dist/build/FindxPrivacyControl.webext
rm -rf $DES
mkdir -p $DES

bash ./tools/make-assets.sh $DES

cp -R src/css                           $DES/
cp -R src/img                           $DES/
cp -R src/js                            $DES/
cp -R src/lib                           $DES/
cp -R src/_locales_findx                      $DES/
mv $DES/_locales_findx      $DES/_locales
if [ -d $DES/_locales/nb ]; then
	cp -R $DES/_locales/nb                  $DES/_locales/no
fi
cp src/*.html                           $DES/
cp platform/chromium/*.js               $DES/js/
cp platform/chromium/*.html             $DES/
cp platform/chromium/*.json             $DES/
cp LICENSE.txt                          $DES/

cp platform/webext/manifest.json        $DES/
cp platform/webext/vapi-usercss.js      $DES/js/
cp platform/webext/vapi-webrequest.js   $DES/js/

echo "*** FindxPrivacyControl.webext: concatenating content scripts"
cat $DES/js/vapi-usercss.js > /tmp/contentscript.js
echo >> /tmp/contentscript.js
grep -v "^'use strict';$" $DES/js/vapi-usercss.real.js >> /tmp/contentscript.js
echo >> /tmp/contentscript.js
grep -v "^'use strict';$" $DES/js/vapi-usercss.pseudo.js >> /tmp/contentscript.js
echo >> /tmp/contentscript.js
grep -v "^'use strict';$" $DES/js/contentscript.js >> /tmp/contentscript.js
mv /tmp/contentscript.js $DES/js/contentscript.js
rm $DES/js/vapi-usercss.js
rm $DES/js/vapi-usercss.real.js
rm $DES/js/vapi-usercss.pseudo.js


echo "*** FindxPrivacyControl.webext: Generating web accessible resources..."
cp -R src/web_accessible_resources $DES/
python3 tools/import-war.py $DES/

echo "*** FindxPrivacyControl.webext: Generating meta..."
python3 tools/make-webext-meta.py $DES/

echo "*** FindxPrivacyControl.webext: Merge localizations..."
python3 tools/merge_locales.py $DES/

if [ "$1" = all ]; then
    echo "*** FindxPrivacyControl.webext: Creating package..."
    pushd $DES > /dev/null
    zip ../$(basename $DES).xpi -qr *
    popd > /dev/null
fi

echo "*** FindxPrivacyControl.webext: Package done."

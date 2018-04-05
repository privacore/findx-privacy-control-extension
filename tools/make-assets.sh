#!/usr/bin/env bash
#
# This script assumes a linux environment

DES=$1/assets

printf "*** Packaging assets in $DES... "

#if [ -n "${TRAVIS_TAG}" ]; then
  rm -rf .uassets
  mkdir .uassets
  cd .uassets
#  pushd .. > /dev/null
  git clone --depth 1 https://github.com/uBlockOrigin/uAssets.git
  cd ..
#  popd > /dev/null
#fi

rm -rf $DES
mkdir $DES
cp    ./assets/assets.json                                       $DES/

mkdir $DES/thirdparties
cp -R .uassets/uAssets/thirdparties/easylist-downloads.adblockplus.org $DES/thirdparties/
cp -R .uassets/uAssets/thirdparties/mirror1.malwaredomains.com         $DES/thirdparties/
cp -R .uassets/uAssets/thirdparties/pgl.yoyo.org                       $DES/thirdparties/
cp -R .uassets/uAssets/thirdparties/publicsuffix.org                   $DES/thirdparties/
cp -R .uassets/uAssets/thirdparties/www.malwaredomainlist.com          $DES/thirdparties/

mkdir $DES/ublock
cp -R .uassets/uAssets/filters/*                                       $DES/ublock/
# Optional filter lists: do not include in package
rm    $DES/ublock/annoyances.txt

echo "done."

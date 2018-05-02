#!/usr/bin/env bash
#
# This script assumes an OS X or *NIX environment

echo '*** FindxPrivacyControl.safariextension: Copying files...'

DES=dist/build/FindxPrivacyControl.safariextension
rm -rf "$DES"
mkdir -p "$DES"

# Delete .DS_Store before making
find . ../uAssets -name '.DS_Store' -type f -delete

bash ./tools/make-assets.sh       "$DES"

cp -R src/css                     "$DES"/
cp -R src/img                     "$DES"/
cp -R src/js                      "$DES"/
cp -R src/lib                     "$DES"/
cp -R src/_locales_findx          "$DES"/
mv $DES/_locales_findx $DES/_locales
cp src/*.html                     "$DES"/
mv $DES/img/icon_128.png          "$DES"/Icon.png
cp platform/safari/*.js           "$DES"/js/
cp -R platform/safari/img         "$DES"/
cp platform/safari/Info.plist     "$DES"/
cp platform/safari/Settings.plist "$DES"/
cp LICENSE.txt                    "$DES"/

# Use some chromium scripts
echo -n '*** FindxPrivacyControl.safariextension: Copying chromium files...'
chromium_files=(vapi.js is-webrtc-supported.{html,js} options_ui.{html,js})
for file in "${chromium_files[@]}"; do
    file=platform/chromium/"$file"
    if [[ ! -e "$file" ]]; then
        >&2 echo "ERROR: $file not found."
        exit 1
    fi
    if [[ "$file" == *.js ]]; then
        cp "$file" "$DES"/js/
    else
        cp "$file" "$DES"/
    fi
done
echo ' ✔'

# Detect OS for sed arguments
if [[ "$OSTYPE" == "darwin"* ]]; then
    sedargs=('-i' '')
else
    sedargs=('-i')
fi

# Use pseudo usercss polyfill
echo -n "*** FindxPrivacyControl.safariextension: Concatenating content scripts..."
cat platform/chromium/vapi-usercss.pseudo.js > /tmp/contentscript.js
# Delete browser check from usercss
sed "${sedargs[@]}" -e '1,/Edge/{/Edge/d;}' -e '1,/ &&/ s///' /tmp/contentscript.js
echo >> /tmp/contentscript.js
grep -v "^'use strict';$" $DES/js/contentscript.js >> /tmp/contentscript.js
mv /tmp/contentscript.js $DES/js/contentscript.js
echo ' ✔'

# https://github.com/el1t/uBlock-Safari/issues/4
echo -n '*** FindxPrivacyControl.safariextension: Adding extensions to extensionless assets...'
find "$DES"/assets/thirdparties -type f -regex '.*\/[^.]*' -exec mv {} {}.txt \;
echo ' ✔'

echo -n '*** FindxPrivacyControl.safariextension: Merge localizations...'
python3 tools/merge_locales.py $DES/
echo ' ✔'

echo -n '*** FindxPrivacyControl.safariextension: Generating Info.plist...'
python tools/make-safari-meta.py "$DES"/
echo ' ✔'

# https://github.com/el1t/uBlock-Safari/issues/15
echo -n '*** FindxPrivacyControl.safariextension: Correcting ctrl to ⌘ in messages...'
for filename in "$DES"/_locales/*.json; do
    sed "${sedargs[@]}" 's/Ctrl/⌘/g' "$filename"
done
echo ' ✔'

# Declare __MSG__ scripts inside client-injected.js
# Beware: this removes all newlines within each script
echo -n '*** FindxPrivacyControl.safariextension: Injecting scripts into vapi-client...'
awkscript='BEGIN { p = 0 }
/^\/\/ __MSG__/ {
  p = 1
  next
}
/^\/\/ __MSG_[A-Za-z_]+__/ && p { exit 0 }
/^[ ]*\/\// { next }
/^[ ]*[^\/]{2}/ && p {
  sub(/^[ ]+/, "", $0)
  gsub(/\\/, "\\\\")
  gsub(/'"'"'/, "\\'"'"'")
  printf "%s", $0
}'
for message in $(perl -nle '/^\/\/ (__MSG_[A-Za-z]+__)/ && print $1' < "$DES"/js/client-injected.js); do
    script=$(awk "${awkscript/__MSG__/${message}}" "$DES"/js/client-injected.js | sed 's/[\"#&]/\\&/g')
    sedargs+=('-e' "s#${message}#${script}#")
done
if ! sed "${sedargs[@]}" "$DES"/js/vapi-client.js 2>/dev/null; then
    sed "${sedargs[@]}" "$DES"/js/vapi-client.js
fi
rm -f "$DES"/js/client-injected.js
echo ' ✔'

# Prepare extension for release
if [ "$1" = all ]; then
    if [ ! -f dist/certs/key.pem ] || [ ! -f dist/certs/SafariDeveloper.cer ]; then
        echo '*** FindxPrivacyControl.safariextension: Cannot sign extension; missing credentials'
        exit 1
    fi
    echo -n '*** FindxPrivacyControl.safariextension: Creating signed extension...'
    if ! bash ./tools/make-safari-sign.sh "$DES"; then
        echo
        echo '*** FindxPrivacyControl.safariextension: Error signing extension'
        exit 1
    fi
    echo ' ✔'

    RELEASES=../uBlock-releases
    if [ -d "$RELEASES" ]; then
        echo -n '*** FindxPrivacyControl.safariextension: Copying into releases directory...'
        cp "${DES/safariextension/safariextz}" "$RELEASES"
        cp "$DES/../Update.plist" "$RELEASES"
        echo ' ✔'
    fi
fi

echo '*** FindxPrivacyControl.safariextension: Done.'


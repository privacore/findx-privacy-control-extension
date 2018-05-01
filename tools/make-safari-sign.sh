#!/usr/bin/env bash

CERT=dist/certs
DES="${1/safariextension/safariextz}"

# Check if mackyle fork is installed (brew install xar-mackyle)
if which xar-mackyle > /dev/null 2>&1; then
    xar='xar-mackyle'
else
    if [ ! -f ./tools/xar ]; then
        printf '\nDownloading and building xar-mackyle into ./tools/xar...\n'
        # Compile patched xar
        curl -fsSLo xar.tar.gz https://github.com/mackyle/xar/archive/xar-1.6.1.tar.gz > /dev/null
        tar -xzf xar.tar.gz > /dev/null
        cd xar-xar-1.6.1/xar
        export CFLAGS='-w'
        export CPPFLAGS='-w'
        ./autogen.sh --noconfigure > /dev/null
        if ! ./configure --disable-shared > /dev/null; then
            echo 'error: could not compile xar-mackyle'
            cd ../..
            exit 1
        fi
        make > /dev/null
        mv src/xar ../../tools/xar-mackyle
        cd ../..
        rm -rf xar-xar-1.6.1 xar.tar.gz
        unset CFLAGS CPPFLAGS
        printf 'Signing extension...'
    fi
    xar="$(pwd)/tools/xar-mackyle"
fi

siglen="$CERT/siglen.txt"
if [ ! -f "$siglen" ]; then
    openssl dgst -sign "$CERT/key.pem" -binary < "$CERT/key.pem" | wc -c > "$siglen"
fi

# Create archive
"$xar" -czf "$DES" \
    --distribution \
    --directory "${1%/*}" \
    "${1##*/}"

# Create digest
"$xar" --sign -f "$DES" --digestinfo-to-sign "$CERT/digestinfo.dat" \
    --sig-size "$(cat "$siglen")" \
    --cert-loc "$CERT/SafariDeveloper.cer" \
    --cert-loc "$CERT/AppleWWDRCA.cer" \
    --cert-loc "$CERT/AppleIncRootCertificate.cer"

# Create RSA signature
openssl rsautl -sign -inkey "$CERT/key.pem" -in "$CERT/digestinfo.dat" -out "$CERT/signature.dat"

# Sign archive
"$xar" --inject-sig "$CERT/signature.dat" -f "$DES"

rm -f "$CERT/signature.dat" "$CERT/digestinfo.dat"

unset xar

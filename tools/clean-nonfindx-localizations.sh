#!/usr/bin/env bash
#
# This script assumes a linux environment

printf "*** Removing non-official Findx localization files... "

# Find and delete localization files not marked with "findxOfficial"
find src/_locales -name messages.json -print0|xargs -0 grep -L "findxOfficial"|xargs rm
# Remove empty folders
find src/_locales -type d -empty -delete

echo "done."

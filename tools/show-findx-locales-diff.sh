#!/bin/bash

# You need these two tools installed:
#  jq - Command-line JSON processor
#  comm - compare two sorted files line by line


jq -c 'to_entries[] | [.key]' src/_locales_findx/en/messages.json|sort > default.tmp

# for i in {'da','en'}
for i in 'da'
do
        jq -c 'to_entries[] | [.key]' src/_locales_findx/$i/messages.json|sort > t.tmp

        echo ""
        echo "Entries that should be REMOVED from $i/messages.json:"
        comm -23 t.tmp default.tmp
        echo ""

        echo "Entries that should be ADDED to $i/messages.json:"
        comm -13 t.tmp default.tmp
        echo ""
done

rm -f default.tmp t.tmp

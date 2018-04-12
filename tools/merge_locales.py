#!/usr/bin/env python3

import os
import json
import re
import sys
from collections import OrderedDict

if len(sys.argv) == 1 or not sys.argv[1]:
    raise SystemExit('Build dir missing.')

pj = os.path.join

source_dir = pj(os.path.split(os.path.abspath(__file__))[0], '..')
build_dir = os.path.abspath(sys.argv[1])

source_locales_dir = pj(source_dir, 'src/_locales')
findx_source_locales_dir = pj(source_dir, 'src/_locales_findx')
build_locales_dir = pj(build_dir, '_locales')

# An array of language code used by Findx Privacy Control: ['en', 'da', ...]
findx_language_codes = os.listdir(findx_source_locales_dir)

# We check existence of each string from findx_locale_strings in orig_locale_strings.
# If there is no such string, we add it to orig_locale_strings.
# If the string already exists in orig_locale_strings, and the value of 'message' of this sting is different from the value of 'message' of the string in findx_locale_strings, we replace the string in orig_locale_strings
for lang_code in findx_language_codes:
    orig_locale_path = pj(source_locales_dir, lang_code, 'messages.json')
    findx_locale_path = pj(findx_source_locales_dir, lang_code, 'messages.json')

    with open(orig_locale_path, encoding="utf8") as f1, open(findx_locale_path, encoding="utf8") as f2:
        orig_locale_strings = json.load(f1, object_pairs_hook=OrderedDict)
        findx_locale_strings = json.load(f2, object_pairs_hook=OrderedDict)

    for string_key in findx_locale_strings:
        findx_string = findx_locale_strings[string_key]
        if string_key in orig_locale_strings:
            orig_string = orig_locale_strings[string_key]
            if orig_string['message'] != findx_string['message']:
                orig_string.update(findx_string)
        else:
            orig_locale_strings[string_key] = findx_string

    with open(pj(build_locales_dir, lang_code, 'messages.json'), 'w', encoding="utf8") as outfile:
        json.dump(orig_locale_strings, outfile, sort_keys=False, indent=4, ensure_ascii=False)


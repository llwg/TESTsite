#!/bin/bash

./site_main/generate_site.js <(./parse_pandoc.js <(pandoc --to json projects.md)) > site_main/docs/index.html
cp site_main/template/script.js site_main/template/style.css site_main/docs/
cat site_main/template/misc.html  | sed -E 's|../../media/docs/stills/([^'\''"]+)|https://jolinnaliarchive.github.io/media/stills/\1|g' > site_main/docs/misc.html

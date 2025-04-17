#!/usr/bin/env bash
set -e
rm -rf mirror && mkdir -p mirror

httrack https://www.midjourney.com/explore?tab=top \
  -O mirror  -%v -N100 -s0 -c8  -q -K0 \
  "+www.midjourney.com/explore*" \
  "+www.midjourney.com/_next/static/*" \
  "+*.css" "+*.js" "+*.png" "+*.jpg" "+*.svg" "+*.woff*" \
  "-*"
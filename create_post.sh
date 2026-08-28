#!/bin/bash
set -e
name=$1
today=$(date +%F)

if [ -z "$name" ]; then
    echo "Usage: ./create_post.sh <slug> [locked-password]"
    exit 1
fi

enc_post="---
title:  
description: 
date: $today
tags: [\"\", \"\"]
summary: placeholder
---



{{< locked \"$name\" >}}

{{< /locked >}}
"

unenc_post="---
title:  
description: 
date: $today
tags: [\"\", \"\"]
summary: placeholder
---


"
post=$unenc_post
if [ -n "$2" ]; then
    post=$enc_post
    jq ". + {\"$name\": \"$2\"}" ./secrets.json > ./secrets.json.tmp
    mv ./secrets.json.tmp ./secrets.json 
fi

# Page bundle: both languages share one directory, so img/ is written once and
# referenced from index.ru.md and index.en.md alike.
dir="./content/posts/$name"
if [ -e "$dir" ]; then
    echo "$dir already exists"
    exit 1
fi
mkdir -p "$dir/img"
echo "$post" > "$dir/index.ru.md"
echo "$post" > "$dir/index.en.md"

echo "Created $dir"
echo "Drop screenshots into $dir/img/ and reference them as ![alt](img/01.png \"caption\")"

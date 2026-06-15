#!/bin/bash
name=$1
today=$(date +%F)

enc_post="---
title:  
description: 
date: $today
tags: [\"\", \"\"]
summary: 
---



{{< locked \"$1\" >}}

{{< /locked >}}
"

unenc_post="---
title:  
description: 
date: $today
tags: [\"\", \"\"]
summary: 
---


"
post=$unenc_post
if [ -n "$2" ]; then
    post=$enc_post
    jq ". + {\"$name\": \"$2\"}" ./secrets.json > ./secrets.json.tmp
    mv ./secrets.json.tmp ./secrets.json 
fi

mkdir -p ./content/posts
echo "$post" > "./content/posts/$name.ru.md"
echo "$post" > "./content/posts/$name.en.md"

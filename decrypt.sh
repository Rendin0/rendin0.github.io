#!/bin/bash
set -e
source ~/.blog_master_key
if [ -z "$MASTER_KEY" ]; then
    echo "MASTER_KEY not found in ~/.blog_master_key"
    exit 1
fi

# --- secrets.json ---
if [ ! -f secrets.json.enc ]; then
    echo "secrets.json.enc not found"
    exit 1
fi
if [ -f secrets.json ]; then
    read -p "secrets.json already exists. Overwrite? (y/N) " ans
    [ "$ans" = "y" ] || { echo "Cancelled"; exit 0; }
fi
openssl enc -d -aes-256-cbc -pbkdf2 \
    -in secrets.json.enc -out secrets.json -pass pass:"$MASTER_KEY"
echo "Decrypted: secrets.json.enc -> secrets.json"

# --- posts ---
# Mirror of lock_posts.sh: enc/<path>.enc -> content/posts/<path>
if [ ! -d enc ] || [ -z "$(find enc -type f -name '*.enc' -print -quit)" ]; then
    echo "No sealed posts in enc/"
    exit 1
fi
if [ -d content/posts ] && [ -n "$(ls -A content/posts 2>/dev/null)" ]; then
    read -p "content/posts is not empty. Overwrite? (y/N) " ans
    [ "$ans" = "y" ] || { echo "Cancelled"; exit 0; }
fi

count=0
while IFS= read -r -d '' enc; do
    rel=${enc#enc/}
    out="content/posts/${rel%.enc}"
    mkdir -p "$(dirname "$out")"
    openssl enc -d -aes-256-cbc -pbkdf2 \
        -in "$enc" -out "$out" -pass pass:"$MASTER_KEY"
    count=$((count + 1))
done < <(find enc -type f -name '*.enc' -print0)

echo "Decrypted: $count file(s) -> content/posts/"

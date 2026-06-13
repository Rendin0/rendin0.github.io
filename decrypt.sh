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
if [ ! -f posts.tar.enc ]; then
    echo "posts.tar.enc not found"
    exit 1
fi
if [ -d content/posts ] && [ -n "$(ls -A content/posts 2>/dev/null)" ]; then
    read -p "content/posts is not empty. Overwrite? (y/N) " ans
    [ "$ans" = "y" ] || { echo "Cancelled"; exit 0; }
fi
mkdir -p content
openssl enc -d -aes-256-cbc -pbkdf2 \
    -in posts.tar.enc -pass pass:"$MASTER_KEY" | tar xzf - -C content
echo "Decrypted: posts.tar.enc -> content/posts/"
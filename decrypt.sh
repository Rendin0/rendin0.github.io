#!/bin/bash
set -e

source ~/.blog_master_key

if [ -z "$MASTER_KEY" ]; then
    echo "MASTER_KEY not found in ~/.blog_master_key"
    exit 1
fi

if [ ! -f secrets.json.enc ]; then
    echo "secrets.json.enc not found"
    exit 1
fi

# check if secrets.json already exists
if [ -f secrets.json ]; then
    read -p "secrets.json already exists. Overwrite? (y/N) " ans
    [ "$ans" = "y" ] || { echo "Cancelled"; exit 0; }
fi

openssl enc -d -aes-256-cbc -pbkdf2 \
    -in secrets.json.enc -out secrets.json -pass pass:"$MASTER_KEY"

echo "Decrypted: secrets.json.enc -> secrets.json"
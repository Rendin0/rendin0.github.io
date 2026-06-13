#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: ./deploy.sh \"commit message\""
    exit 1
fi

source ~/.blog_master_key

if [ -z "$MASTER_KEY" ]; then
    echo "MASTER_KEY not found in ~/.blog_master_key"
    exit 1
fi


if [ ! -f secrets.json ]; then
    echo "secrets.json not found"
    exit 1
fi

# encrypt content/posts
tar czf - -C content posts | \
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$MASTER_KEY" -out posts.tar.enc
echo "Encrypted content/posts -> posts.tar.enc"

# encrypt secrets.json
openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in secrets.json -out secrets.json.enc -pass pass:"$MASTER_KEY"
echo "Encrypted: secrets.json -> secrets.json.enc"

git add -A
git commit -m "$1"
git push

echo "Pushed: $1"
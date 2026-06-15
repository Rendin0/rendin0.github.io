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
./lock_posts.sh "$MASTER_KEY"

# encrypt secrets.json
./lock_secrets.sh "$MASTER_KEY"

git add -A
git commit -m "$1" || { echo "Nothing to commit"; exit 0; }
git push

echo "Pushed: $1"
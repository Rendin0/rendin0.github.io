#!/bin/bash
set -e
MASTER_KEY=$1

newsum=$(sha256sum secrets.json | cut -d' ' -f1)
if [ "$newsum" != "$(cat .secretshash 2>/dev/null)" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt \
        -in secrets.json -out secrets.json.enc -pass pass:"$MASTER_KEY"
    echo "$newsum" > .secretshash
    echo "Encrypted: secrets.json -> secrets.json.enc"
else
    echo "secrets.json unchanged"
fi
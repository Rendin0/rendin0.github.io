#!/bin/bash
set -e
MASTER_KEY=$1

if [ -z "$MASTER_KEY" ]; then
  echo "Usage: ./lock_posts.sh <master-key>"
  exit 1
fi

# enc/ holds the only copy of the posts (content/posts is gitignored) and the
# sweep below deletes every .enc without a matching source file. A missing or
# empty content/posts is never "every post was deleted", it is a tree that was
# never unsealed - bail out instead of wiping the originals.
if [ ! -d content/posts ] || [ -z "$(find content/posts -type f -print -quit)" ]; then
  echo "content/posts is missing or empty - refusing to seal."
  echo "Run ./decrypt.sh first: enc/ holds the only copy of the posts."
  exit 1
fi

mkdir -p enc
hashfile=".posthashes"
touch "$hashfile"

old_hash() { awk -F'\t' -v n="$1" '$1==n {print $2}' "$hashfile"; }
put_hash() {
  awk -F'\t' -v n="$1" -v h="$2" 'BEGIN{OFS="\t"} $1!=n{print} END{print n,h}' \
    "$hashfile" > "$hashfile.tmp"
  mv "$hashfile.tmp" "$hashfile"
}
drop_hash() {
  awk -F'\t' -v n="$1" '$1!=n' "$hashfile" > "$hashfile.tmp"
  mv "$hashfile.tmp" "$hashfile"
}

changed=0
declare -A keep

# Posts are page bundles now (content/posts/<slug>/index.<lang>.md + images), so
# every file under content/posts is sealed, not just markdown. Paths are
# mirrored into enc/ one file at a time: sealing a whole tarball instead would
# rewrite a multi-megabyte blob in git history on every screenshot edit.
while IFS= read -r -d '' src; do
  rel=${src#content/posts/}
  enc="enc/$rel.enc"
  keep["$enc"]=1

  new=$(sha256sum "$src" | cut -d' ' -f1)
  if [ "$new" != "$(old_hash "$rel")" ]; then
    mkdir -p "$(dirname "$enc")"
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$MASTER_KEY" -in "$src" -out "$enc"
    put_hash "$rel" "$new"
    echo "Sealed: $rel"
    changed=1
  fi
done < <(find content/posts -type f -print0)

if [ -d enc ]; then
  while IFS= read -r -d '' enc; do
    if [ -z "${keep[$enc]}" ]; then
      rm -f "$enc"
      rel=${enc#enc/}
      drop_hash "${rel%.enc}"
      echo "Removed stale: $enc"
      changed=1
    fi
  done < <(find enc -type f -name '*.enc' -print0)

  find enc -mindepth 1 -type d -empty -delete
fi

if [ "$changed" -eq 0 ]; then
  echo "No changes."
fi

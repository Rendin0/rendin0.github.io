#!/bin/bash
set -e
MASTER_KEY=$1

mkdir -p enc
hashfile=".posthashes"
touch "$hashfile"

old_hash() { awk -F'\t' -v n="$1" '$1==n {print $2}' "$hashfile"; }
put_hash() {
  awk -F'\t' -v n="$1" -v h="$2" 'BEGIN{OFS="\t"} $1!=n{print} END{print n,h}' \
    "$hashfile" > "$hashfile.tmp"
  mv "$hashfile.tmp" "$hashfile"
}

changed=0
declare -A keep
shopt -s nullglob

for md in content/posts/*.md; do
  name=$(basename "$md")
  enc="enc/$name.enc"
  keep["$enc"]=1

  new=$(sha256sum "$md" | cut -d' ' -f1)
  if [ "$new" != "$(old_hash "$name")" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$MASTER_KEY" -in "$md" -out "$enc"
    put_hash "$name" "$new"
    echo "Sealed: $name"
    changed=1
  fi
done

# убрать .enc для удалённых постов
for enc in enc/*.enc; do
  if [ -z "${keep[$enc]}" ]; then
    rm -f "$enc"
    base=$(basename "$enc" .enc)
    awk -F'\t' -v n="$base" '$1!=n' "$hashfile" > "$hashfile.tmp" && mv "$hashfile.tmp" "$hashfile"
    echo "Removed stale: $enc"
    changed=1
  fi
done

[ "$changed" -eq 0 ] && echo "No changes."
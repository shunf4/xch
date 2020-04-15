#!/bin/bash
set -eo pipefail

tsc

my_rsync () {
    SRC=$1
    DST=$2
    
    git -C $SRC ls-files --exclude-standard -oi --directory > .git/ignores.tmp
    rsync -e 'ssh -o ClearAllForwardings=yes' --recursive --relative --update --links --perms --times --info=progress2 --partial --human-readable --delete --exclude=".git" --include="built/*" --include="built/" --exclude-from=".git/ignores.tmp" $SRC $DST
}

DSTS=$(git remote get-url --all --push deploy)

for DST in $DSTS; do
	echo $DST:
	(my_rsync "." "$DST") &
done

wait $(jobs -p)

#--archive = --recursive + --links + --perms + --times + --group + --owner + --devices + --specials


# Release-compose — proef van het in- en uitpakken, 28 september 2026

Hoort bij `deploy/README.md`, "Eén los `compose.yaml` per project".

**Aanleiding.** Elke release onder `/srv/apps/when2watch/releases/` droeg een eigen `compose.yaml` met
`name: when2watch`. Op 28 september waren dat 16 releases; de compose-collision-scanner telde de 15 die
niet `current` waren als destructief (max2 ISS-15). De procedure laat voortaan alleen de actieve release
een los `compose.yaml` houden.

**Methode.** Uitgevoerd op max2 in een map van `mktemp -d`, met alleen proefbestanden. `/srv` is niet
geraakt en er is geen container gestart. De blokken `inpakken.sh` en `uitpakken.sh` hieronder zijn
woordelijk de blokken uit `deploy/README.md`; alleen `APP` en `REL` wijzen in de proef naar de
tijdelijke map.

## Uitkomst

| # | Proef | Verwacht | Gemeten |
|---|---|---|---|
| 1 | Oude release inpakken | tar en hash met mode 600, geen los `compose.yaml`, scanner vindt de release niet meer | zo gemeten |
| 2 | Actieve release inpakken | geweigerd, bestand ongewijzigd | zo gemeten |
| 3 | Tweemaal inpakken | geweigerd, tar ongewijzigd | zo gemeten |
| 4 | Uitpakken | `compose.yaml` byte-gelijk aan het origineel, `docker compose config -q` slaagt, tar en hash weg | zo gemeten |
| 5 | Uitpakken terwijl `compose.yaml` er staat | geweigerd | zo gemeten |
| 6 | Opnieuw inpakken na terugdraaien | slaagt | zo gemeten |
| 7 | Afwijkende tar bij het inpakken | `compose.yaml` blijft staan, tar en hash weg, exit 1 | zo gemeten |
| 8 | Afwijkende tar bij het uitpakken | niets teruggezet, exit 1 | zo gemeten |
| 9 | Uitpakken van een release die door `compose-inpak` is ingepakt | slaagt, ook het MANIFEST is weg | zo gemeten |

`compose-inpak` is het script uit de repo scrum4me-server waarmee de eenmalige opruiming op max2
gebeurt. Het schrijft dezelfde bestandsnamen, zodat deze procedure ook die releases kan uitpakken.

## Uitvoer

```text
host: max2  tar (GNU tar) 1.35  sha256sum (uutils coreutils) 0.10.0  2026-09-28T16:37:10Z
vooraf, door de scanner gevonden: releases/aaaaaaa/compose.yaml releases/bbbbbbb/compose.yaml releases/ccccccc/compose.yaml releases/ddddddd/compose.yaml 
--- 1. inpakken van een oude release ---
ingepakt: aaaaaaa
exit=0
inhoud: release-compose.SHA256SUMS release-compose.tar | modes: 600 600 
door de scanner gevonden: releases/bbbbbbb/compose.yaml releases/ccccccc/compose.yaml releases/ddddddd/compose.yaml 
--- 2. inpakken van de actieve release wordt geweigerd ---
stop: bbbbbbb is de actieve release
exit=1
inhoud: compose.yaml | ongewijzigd: ja
--- 3. tweemaal inpakken wordt geweigerd; de tar blijft heel ---
stop: geen compose.yaml in aaaaaaa
exit=1
tar ongewijzigd: ja
--- 4. uitpakken voor terugdraaien ---
uitgepakt: aaaaaaa
exit=0
inhoud: compose.yaml | byte-gelijk aan het origineel: ja
--- 5. uitpakken terwijl compose.yaml er al staat wordt geweigerd ---
stop: compose.yaml bestaat al in aaaaaaa
exit=1
--- 6. opnieuw inpakken na het terugdraaien ---
ingepakt: aaaaaaa
exit=0
inhoud: release-compose.SHA256SUMS release-compose.tar 
--- 7. een afwijkende tar bij het inpakken laat compose.yaml staan ---
sha256sum: WARNING: 1 computed checksum did NOT match
stop: de tar wijkt af; compose.yaml blijft staan
exit=1
inhoud: compose.yaml 
--- 8. een afwijkende tar bij het uitpakken wordt niet teruggezet ---
stop: compose.yaml uit de tar wijkt af van de vastgelegde hash
exit=1
inhoud: release-compose.SHA256SUMS release-compose.tar 
--- 9. uitpakken van een release die door compose-inpak is ingepakt ---
uitgepakt: eeeeeee
exit=0
inhoud: compose.yaml | byte-gelijk aan het origineel: ja
opgeruimd: ja
```

## inpakken.sh

```sh
( set -e
  cd "$APP/releases/$REL"
  D=$PWD
  [ "$(readlink -f "$APP/current")" != "$D" ] || { echo "stop: $REL is de actieve release"; exit 1; }
  [ -f compose.yaml ] || { echo "stop: geen compose.yaml in $REL"; exit 1; }
  [ ! -e release-compose.tar ] || { echo "stop: release-compose.tar bestaat al in $REL"; exit 1; }
  umask 077
  sha256sum compose.yaml > release-compose.SHA256SUMS
  tar --format=posix --numeric-owner -cpf release-compose.tar compose.yaml
  X=$(mktemp -d)
  tar -xpf release-compose.tar -C "$X"
  if ( cd "$X" && sha256sum -c "$D/release-compose.SHA256SUMS" > /dev/null ); then
    rm compose.yaml
    echo "ingepakt: $REL"
  else
    rm release-compose.tar release-compose.SHA256SUMS
    echo "stop: de tar wijkt af; compose.yaml blijft staan"
  fi
  rm -r "$X"
  [ ! -e compose.yaml ]
)
```

## uitpakken.sh

```sh
( set -e
  cd "$APP/releases/$REL"
  [ ! -e compose.yaml ] || { echo "stop: compose.yaml bestaat al in $REL"; exit 1; }
  tar -xpf release-compose.tar compose.yaml
  if ! sha256sum -c release-compose.SHA256SUMS > /dev/null; then
    rm compose.yaml
    echo "stop: compose.yaml uit de tar wijkt af van de vastgelegde hash"
    exit 1
  fi
  docker compose -f compose.yaml config -q
  rm -f release-compose.tar release-compose.SHA256SUMS release-compose.MANIFEST.txt
  echo "uitgepakt: $REL"
)
```

## proef.sh

```sh
# Proef van het in- en uitpakken in een tijdelijke map. Alleen proefbestanden; raakt /srv niet.
set -u
echo "host: $(hostname)  $(tar --version | head -1)  $(sha256sum --version | head -1)  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
APP=$(mktemp -d /tmp/w2w-proef.XXXXXX); export APP
new() { mkdir -p "$APP/releases/$1"; printf 'name: w2wproef\nservices:\n  web:\n    image: busybox\n    command: ["echo", "%s"]\n' "$1" > "$APP/releases/$1/compose.yaml"; }
new aaaaaaa; new bbbbbbb; new ccccccc; new ddddddd
ln -s "$APP/releases/bbbbbbb" "$APP/current"
A0=$(sha256sum < "$APP/releases/aaaaaaa/compose.yaml"); B0=$(sha256sum < "$APP/releases/bbbbbbb/compose.yaml")
scan() { find "$APP" -type f \( -name 'docker-compose*.yml*' -o -name 'docker-compose*.yaml*' -o -name 'compose.yml*' -o -name 'compose.yaml*' \) | sed "s|$APP/||" | sort | tr '\n' ' '; }
inhoud() { ls -A "$APP/releases/$1" | tr '\n' ' '; }
echo "vooraf, door de scanner gevonden: $(scan)"
echo "--- 1. inpakken van een oude release ---"
REL=aaaaaaa; export REL; . ./inpakken.sh; echo "exit=$?"
echo "inhoud: $(inhoud aaaaaaa)| modes: $(stat -c '%a' "$APP/releases/aaaaaaa/release-compose.tar" "$APP/releases/aaaaaaa/release-compose.SHA256SUMS" | tr '\n' ' ')"
echo "door de scanner gevonden: $(scan)"
T0=$(sha256sum < "$APP/releases/aaaaaaa/release-compose.tar")
echo "--- 2. inpakken van de actieve release wordt geweigerd ---"
REL=bbbbbbb; export REL; . ./inpakken.sh; echo "exit=$?"
echo "inhoud: $(inhoud bbbbbbb)| ongewijzigd: $([ "$(sha256sum < "$APP/releases/bbbbbbb/compose.yaml")" = "$B0" ] && echo ja || echo NEE)"
echo "--- 3. tweemaal inpakken wordt geweigerd; de tar blijft heel ---"
REL=aaaaaaa; export REL; . ./inpakken.sh; echo "exit=$?"
echo "tar ongewijzigd: $([ "$(sha256sum < "$APP/releases/aaaaaaa/release-compose.tar")" = "$T0" ] && echo ja || echo NEE)"
echo "--- 4. uitpakken voor terugdraaien ---"
REL=aaaaaaa; export REL; . ./uitpakken.sh; echo "exit=$?"
echo "inhoud: $(inhoud aaaaaaa)| byte-gelijk aan het origineel: $([ "$(sha256sum < "$APP/releases/aaaaaaa/compose.yaml")" = "$A0" ] && echo ja || echo NEE)"
echo "--- 5. uitpakken terwijl compose.yaml er al staat wordt geweigerd ---"
REL=aaaaaaa; export REL; . ./uitpakken.sh; echo "exit=$?"
echo "--- 6. opnieuw inpakken na het terugdraaien ---"
REL=aaaaaaa; export REL; . ./inpakken.sh; echo "exit=$?"
echo "inhoud: $(inhoud aaaaaaa)"
echo "--- 7. een afwijkende tar bij het inpakken laat compose.yaml staan ---"
tar() { case " $* " in *" -cpf "*) printf 'name: anders\n' > anders.yaml; command tar --format=posix --numeric-owner -cpf release-compose.tar --transform 's/anders.yaml/compose.yaml/' anders.yaml; rm anders.yaml;; *) command tar "$@";; esac; }
REL=ccccccc; export REL; . ./inpakken.sh; echo "exit=$?"
unset -f tar
echo "inhoud: $(inhoud ccccccc)"
echo "--- 8. een afwijkende tar bij het uitpakken wordt niet teruggezet ---"
REL=ddddddd; export REL; . ./inpakken.sh > /dev/null
( cd "$APP/releases/ddddddd" && printf 'name: anders\n' > anders.yaml && tar --format=posix --numeric-owner -cpf release-compose.tar --transform 's/anders.yaml/compose.yaml/' anders.yaml && rm anders.yaml )
. ./uitpakken.sh 2>/dev/null; echo "exit=$?"
echo "inhoud: $(inhoud ddddddd)"
echo "--- 9. uitpakken van een release die door compose-inpak is ingepakt ---"
new eeeeeee; E0=$(sha256sum < "$APP/releases/eeeeeee/compose.yaml")
( cd "$APP/releases/eeeeeee" && umask 077 && printf '%s  compose.yaml\n' "$(sha256sum compose.yaml | cut -d' ' -f1)" > release-compose.SHA256SUMS && tar --format=posix --numeric-owner -C "$PWD" -cpf release-compose.tar -- compose.yaml && printf 'gemaakt: proef\n' > release-compose.MANIFEST.txt && rm compose.yaml )
REL=eeeeeee; export REL; . ./uitpakken.sh; echo "exit=$?"
echo "inhoud: $(inhoud eeeeeee)| byte-gelijk aan het origineel: $([ "$(sha256sum < "$APP/releases/eeeeeee/compose.yaml")" = "$E0" ] && echo ja || echo NEE)"
rm -rf "$APP"; echo "opgeruimd: $([ -e "$APP" ] && echo nee || echo ja)"
```

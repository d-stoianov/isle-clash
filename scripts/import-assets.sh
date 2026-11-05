#!/usr/bin/env bash
# Copies the art GoGrow uses out of Pixel Frog's "Tiny Swords (Free Pack)" into
# client/public/assets. The pack's license doesn't allow redistributing it, so the
# assets are git-ignored and every developer imports them locally.
#
#   ./scripts/import-assets.sh "/path/to/Tiny Swords (Free Pack)"
set -euo pipefail

SRC="${1:?usage: $0 \"/path/to/Tiny Swords (Free Pack)\"}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/client/public/assets"
[ -d "$SRC/Units" ] || { echo "Not a Tiny Swords pack: $SRC" >&2; exit 1; }

rm -rf "$DEST"
mkdir -p "$DEST"/{units,buildings,terrain,fx,ui}
slug() { echo "$1" | tr 'A-Z _' 'a-z--'; }

for color in Blue Red; do
    team=$(slug "$color")
    U="$SRC/Units/$color Units"
    for f in "Pawn_Idle" "Pawn_Run" "Pawn_Idle Wood" "Pawn_Run Wood" "Pawn_Idle Gold" "Pawn_Run Gold" \
        "Pawn_Idle Meat" "Pawn_Run Meat" "Pawn_Interact Axe" "Pawn_Interact Pickaxe" "Pawn_Interact Knife"; do
        cp "$U/Pawn/$f.png" "$DEST/units/$team-$(slug "$f").png"
    done
    for f in Warrior_Idle Warrior_Run Warrior_Attack1; do cp "$U/Warrior/$f.png" "$DEST/units/$team-$(slug "$f").png"; done
    cp "$U/Archer/Archer_Shoot.png" "$DEST/units/$team-archer-shoot.png"
    cp "$U/Archer/Arrow.png" "$DEST/units/$team-arrow.png"
    for b in Castle Tower; do cp "$SRC/Buildings/$color Buildings/$b.png" "$DEST/buildings/$team-$(slug "$b").png"; done
done

T="$SRC/Terrain"
cp "$T/Tileset/Tilemap_color1.png" "$DEST/terrain/tilemap.png"
cp "$T/Tileset/Water Foam.png" "$DEST/terrain/foam.png"
cp "$T/Tileset/Water Background color.png" "$DEST/terrain/water.png"
cp "$T/Tileset/Shadow.png" "$DEST/terrain/shadow.png"
for i in 1 2; do
    cp "$T/Resources/Wood/Trees/Tree$i.png" "$DEST/terrain/tree$i.png"
    cp "$T/Resources/Wood/Trees/Stump $i.png" "$DEST/terrain/stump$i.png"
    cp "$T/Decorations/Rocks/Rock$i.png" "$DEST/terrain/rock$i.png"
done
for i in 1 2 3; do
    cp "$T/Decorations/Bushes/Bushe$i.png" "$DEST/terrain/bush$i.png"
    cp "$T/Decorations/Rocks in the Water/Water Rocks_0$i.png" "$DEST/terrain/water-rock$i.png"
done
for i in 01 03 05; do cp "$T/Decorations/Clouds/Clouds_$i.png" "$DEST/terrain/cloud$i.png"; done
cp "$T/Resources/Gold/Gold Stones/Gold Stone 4.png" "$DEST/terrain/gold.png"
cp "$T/Resources/Gold/Gold Stones/Gold Stone 4_Highlight.png" "$DEST/terrain/gold-highlight.png"
cp "$T/Resources/Gold/Gold Stones/Gold Stone 1.png" "$DEST/terrain/gold-small.png"
cp "$T/Resources/Meat/Sheep/Sheep_Idle.png" "$DEST/terrain/sheep-idle.png"
cp "$T/Resources/Meat/Sheep/Sheep_Move.png" "$DEST/terrain/sheep-move.png"
cp "$T/Resources/Meat/Sheep/Sheep_Grass.png" "$DEST/terrain/sheep-grass.png"
cp "$T/Resources/Wood/Wood Resource/Wood Resource.png" "$DEST/ui/wood.png"
cp "$T/Resources/Meat/Meat Resource/Meat Resource.png" "$DEST/ui/meat.png"
cp "$T/Resources/Gold/Gold Resource/Gold_Resource.png" "$DEST/ui/gold.png"
for i in 1 2 3 4; do cp "$T/Resources/Tools/Tool_0$i.png" "$DEST/ui/tool$i.png"; done

F="$SRC/Particle FX"
cp "$F/Dust_01.png" "$DEST/fx/dust.png"
cp "$F/Explosion_01.png" "$DEST/fx/explosion.png"
cp "$F/Explosion_02.png" "$DEST/fx/explosion2.png"
for i in 1 2 3; do cp "$F/Fire_0$i.png" "$DEST/fx/fire$i.png"; done
cp "$F/Water Splash.png" "$DEST/fx/splash.png"

UI="$SRC/UI Elements/UI Elements"
cp "$UI/Wood Table/WoodTable.png" "$DEST/ui/woodtable.png"
cp "$UI/Papers/RegularPaper.png" "$DEST/ui/paper.png"
cp "$UI/Papers/SpecialPaper.png" "$DEST/ui/paper-special.png"
cp "$UI/Banners/Banner.png" "$DEST/ui/banner.png"
cp "$UI/Ribbons/BigRibbons.png" "$DEST/ui/ribbons.png"
cp "$UI/Bars/BigBar_Base.png" "$DEST/ui/bar-base.png"
cp "$UI/Bars/SmallBar_Base.png" "$DEST/ui/sbar-base.png"
for b in BigBlueButton BigRedButton; do
    for s in Regular Pressed; do
        cp "$UI/Buttons/${b}_$s.png" "$DEST/ui/$(echo "$b" | sed 's/\([A-Z]\)/-\1/g; s/^-//' | tr 'A-Z' 'a-z')-$(slug "$s").png"
    done
done
for i in 03 06 07; do cp "$UI/Icons/Icon_$i.png" "$DEST/ui/icon$i.png"; done
cp "$UI/Cursors/Cursor_01.png" "$DEST/ui/cursor.png"
cp "$UI/Human Avatars/Avatars_05.png" "$DEST/ui/avatar05.png"
cp "$UI/Human Avatars/Avatars_09.png" "$DEST/ui/avatar09.png"

echo "Imported $(find "$DEST" -type f | wc -l | tr -d ' ') files into $DEST"

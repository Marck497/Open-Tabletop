# Mesa de Rol 🎲

**English** · [Español](README.es.md)

A self-hosted virtual tabletop (VTT) for playing tabletop RPGs online with friends, inspired by Roll20. It is designed to run at home on a **Raspberry Pi 5** and to grow one module at a time.

## Languages

The program is available in **English and Spanish**.

- **Interface:** each person picks their language with the 🌐 selector at the top right of the campaign list (or in *Table → Effects* inside a campaign). It is remembered in that browser. The first time, it follows the browser's language.
- **Campaign language:** what the server writes in a campaign (chat messages for rolls, damage and AI, new scenes, generated adventures, monster sheets) uses the campaign's language. It starts as the language of whoever creates the campaign, and the DM can change it in *⚙️ Settings → Campaign language*.
- Your own content (names, notes, edited sheet templates…) is never translated.

## Status

| Step | Contents | Status |
| --- | --- | --- |
| 1 | Foundation: accounts, campaigns, invitations, DM/player roles, real-time presence, Docker | ✅ |
| 2 | Real-time board: maps, grid, tokens, layers and fog of war | ✅ |
| 3 | Editable character sheets (D&D 5e template, swappable game system) | ✅ |
| 4 | Chat, dice, initiative and a guide for connecting from outside your home network | ✅ |

## Installing on a Raspberry Pi 5

You need 64-bit Raspberry Pi OS (or any arm64 Linux) with Docker.

```bash
# 1. Install Docker (first time only)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in afterwards

# 2. Download the project
git clone https://github.com/Marck497/Open-Tabletop.git
cd Open-Tabletop

# 3. Configuration (optional, but recommended if you expose it to the internet)
cp .env.example .env
nano .env   # set a REGISTRATION_CODE so only your friends can sign up

# 4. Start it
docker compose up -d --build
```

Open `http://PI-IP-ADDRESS:3000` from any device on your network. The first build on the Pi takes a few minutes.

- **Update:** `git pull && docker compose up -d --build`
- **View logs:** `docker compose logs -f`
- **Backup:** everything is stored in the `data/` folder. Copying it is enough.

> **To let your friends join from their own homes**, follow [`docs/ACCESO_EXTERNO.md`](docs/ACCESO_EXTERNO.md) (in Spanish). The recommended option (Tailscale Funnel) is free and doesn't require touching your router. It also explains how to make backups.

## Using the board

**DM**
- Pick the **layer** in the top bar: *Map* (background), *Tokens* (characters) or *DM (hidden)* (only you can see it). You can only select items on the active layer.
- **+ Image** uploads maps or portraits; **+ Token** creates a coloured token. In the right-hand panel you can change its name, size, layer, image and which players can move it.
- **Fog** (☁ Fog menu): turn it on and use *☀ Reveal* / *☁ Hide* by dragging rectangles. You see it semi-transparent; players see it black. Enemy tokens under the fog are never even sent to players.
- **Walls and vision** (🧱 Walls): drag to draw walls (they snap to grid corners and to the ends of other walls; hold *Alt* for free placement). Choose the type: *wall*, *door*, *window* (blocks movement but not sight) or *secret door* (a wall for players until you open it). Click a wall to change its type; with *🧽 Erase*, click to remove it. On the board they are drawn as stone walls with pillars at the corners, wooden doors (open doors swing on their hinge) and glass windows; the coloured lines only appear while editing with 🧱 Walls.
- In the **👁 Vision** menu, turn on *Dynamic vision* so each player only sees what their tokens can see: the rest stays dark, and areas already explored stay dimmed. Tokens they can't see are never sent to them. *Range* limits how far they see (in squares, 0 = unlimited) and *View as players* shows you the darkness. Note: with vision on, a player with no tokens in the scene sees nothing.
- **Doors**: click the 🚪 icon to open or close a door. As DM, *Shift*+click locks it 🔒. Players can open doors they can see that aren't locked, and can't move their tokens through walls or closed doors.
- **Scenes**: the **🗺** button in the top bar (and the *Scenes* tab) opens the list of maps you have prepared.
  - Click a scene to open it **just for you**: players don't see it until you move them there.
  - **Bring ▾** lets you choose:
    - **Whole party**: everyone goes to that scene.
    - Only the players you tick: the rest stay where they were, so you can split the party.
  - Each player only sees the scene they are in. In the list, the party's scene is labelled *Party*, and each player shows up as their initial on the map where they are. At the top you can see who is in the scene you have open.
  - **Folders**: create them with *+ Folder* (📁+ creates a subfolder), rename them with ✎ and collapse them with a click. If you delete a folder, its scenes aren't lost: they move up to the parent folder.
  - **Drag** a scene or folder to reorder it. Dropping it onto another folder puts it inside; dropping it on the top edge places it before. *Drop here to take out of folders* moves it back to the root.
  - **⧉ Duplicate** (*Scenes* tab, with the scene open): makes a copy right below it, with its map, walls, fog, lights, objects and enemies. Players' tokens and drawings are not copied.
  - **📚 Save to library**: saves a copy to your personal library (images included). From **📚 Library**, in any of your campaigns, *+ Use here* creates a new scene from it. What you save stays there even if you delete the original scene or campaign.
  - **⬆ Import** (top of the *Scenes* tab) creates a scene from a **Dungeondraft map** (`.dd2vtt`) or from other programs that export the *Universal VTT* format (Dungeon Alchemist `.uvtt`, DungeonFog `.df2vtt`…):
    - the map image fills the whole scene, on the *Map* layer;
    - walls and doors are placed and aligned with the drawing. They aren't painted on top, because the image already shows them, but they block sight and movement;
    - each light in the map becomes an invisible light on the DM layer;
    - dynamic vision is turned on, but not darkness, because the image already has its own lighting.

    The image must be under 25 MB: if it's bigger, export it with fewer pixels per square (e.g. 100) or as WEBP.
  - **⬇ Export** downloads the scene as a `.vtt-escena.json.gz` file so you can give it to another DM or move it to another server; load it with *⬆ Import file* in the library window. Tokens are exported without linked sheets or owners.

**Everyone**
- Drag the background to pan and use the mouse wheel to zoom.
- **Measure** (📏 in the bar): drag to measure. While holding, a **right-click** (or *Space*) adds a waypoint to change direction, *Alt* measures without snapping to the grid and *Esc* removes it. Everyone sees your ruler with your name.
- **Area templates** (◯ circle, ◺ cone, ━ line, ▢ cube): highlight the squares affected by a spell and measure in whole squares.
- **Ping** (📍 or double-click the background): points out a spot to the table. The DM can hold *Shift* to also centre everyone's view there. Whatever the DM measures on the DM layer is only visible to DMs.
- When dragging a token you see how far it has moved. While holding, a **right-click** (or *Space*) drops a waypoint: that way you can turn a corner or go around a wall you can't cross in a straight line, and the distance counts the whole path.
- **Draw** (✏️): freehand, lines, rectangles, ellipses and text, with colour and thickness. The DM draws on the active layer (including their own hidden one). Players draw on the token layer and can move, resize or delete (Del) their drawings.
- **Conditions**: selecting a token shows a bar at the bottom with conditions (poisoned, prone, concentrating…). They appear as icons on the token. Each player can toggle them on their own tokens. The list is edited in the sheet template (*Token conditions*), and conditions marked *Loses turn* make that enemy's AI skip its turn.
- The distance per square (5 feet by default), the unit and how diagonals are counted are set in *Scene settings*.
- Tokens snap to the grid when dropped (hold **Alt** to move them freely).
- **Del** deletes the selected item (DM) and **Esc** clears the selection.

**Arranging the screen**
- **Character sheets**: drag them by their header (⠿) wherever you like and minimise them with ▁. Each browser remembers where you left each sheet. The one you touch comes to the front.
- **Sidebar**: drag its left edge to widen it (double-click resets it) and hide it with **Panel ⇥** in the top right or with the **B** key.
- **New messages**: if you're on another tab (or the sidebar is hidden), a red counter tells you about new chat messages and documents the DM shares with you in the Journal.
- **Tabs**: *Shift+1, 2, 3…* opens each one. The DM also has **⚙️ Settings** with the invitation, the campaign language, backups and performance.

### ✨ Quick adventure

In *Scenes*, **✨ Quick adventure** instantly creates a new scene ready to play. You choose the location (dungeon, crypt, castle, sewers, mine, cave, forest, road or village), the size, how many rooms, the party (taken automatically from the campaign's PCs) and the difficulty, and it prepares:

- the generated, furnished map, with dynamic vision;
- a **numbered note in each room**, following the route from the entrance (1). Each note says what the characters see (to read out with 📣) and, below the line, what only you know;
- **encounters** with monsters from the compendium at the chosen difficulty (the last one, the boss, is harder), with their sheets and AI, hidden on the DM layer. Optionally, they **appear on their own** when a player enters their room;
- **traps** with saving throws and damage scaled to level, and a **treasure chest** at the end.

Players don't see the scene until you bring them with *Bring*. Everything can be tweaked afterwards.

### Numbered map notes

In the *Scenes* tab, with the scene open, **📍 Map notes → + Note** places a numbered circle (1, 2, 3…) on the DM layer, like the room numbers on an adventure module map. Drag it into place and write its title and text in the panel; players never see it.

- The list shows all the scene's notes: click one to jump to it.
- **📣 Read in chat** sends everyone the title and the text before a line containing `---` (the description you read when they enter a room). Everything after the line is for you only and is never sent; before sending, it shows you what will go out.
- If you delete some, **Renumber** makes them 1, 2, 3… again. They are copied along with the scene when you duplicate it, export it or save it to the library.

### Traps and alert zones

In *Scenes*, **🪤 Traps and zones → + Trap** or **+ Zone** places a rectangle on the DM layer: move it and resize it from the corners. It triggers automatically when a token enters it (even if it only passes through; moving around inside doesn't count). Players don't see it or receive its settings.

- **Trap**: with a **saving throw** (ability and DC) and **damage** (formula and type). When triggered, the damage and the token's saving throw are rolled using its sheet, and the result is applied (half or none on a success, with resistances). Example: pit, Dexterity DC 13, 2d10 bludgeoning.
- **Alert zone**: just notifies you (e.g. "they've entered the throne room").
- For both:
  - **Message for everyone** is posted to the chat when triggered ("The floor gives way beneath your feet!"), and your **DM notes** are sent to you only.
  - **Reveal** moves whatever you have hidden inside it on the DM layer to the token layer: lurking monsters for an ambush, or the pit itself.
  - By default only player tokens trigger them; with *Any token*, monsters do too (including AI-controlled ones).
  - *One-time* ones disarm when triggered; they can be **re-armed** from the list.

### Aligning an image's grid

If you upload a map that already has a grid drawn on it and it doesn't match the scene's grid, select it (*Map* layer) and click **📐 Align grid**:

- Drag a rectangle over the image that covers exactly a few of its grid squares and say how many (e.g. 3 × 2). Orange lines split the rectangle so you can check they line up with the image's lines. The more squares you mark, the more accurate it is.
- Or, if you know how big the whole map is, enter its width in squares (the height is worked out proportionally).
- **Apply** scales and moves the image so its squares match the scene's. With *Fit scene to image* (on by default), it also moves it to the corner and resizes the scene so it fits entirely. Ctrl+Z undoes; Esc cancels.

## Map editor

The **🗺️ Maps** button (DM only) opens a palette to the right of the board for building maps without any images:

- **Textured floors**: flagstones, cobblestones, wood, tiles, marble, carpet, cave, grass, dirt, sand, snow, forest, water, swamp, ice, lava, chasm, rock and brick (the last two act as walls).
- **Tools**: 🖌️ brush (B, size with `[` and `]`), ▭ rectangle (R), 🪣 fill (G), 🧽 erase (E), 💧 eyedropper (I).
- **🏠 Room** (H): drag a rectangle and a room appears with its walls. Rooms that touch are joined.
- **🚪 Door** (P): click on the edge of a square to add or remove a door.
- **Automatic walls**: placed automatically wherever floor meets empty space or a wall, and rebuilt as you paint; walls you place by hand are kept.
- **🌲 Objects** (O): trees, rocks, furniture, chests, skulls, signs… from 1 to 4 squares. They are placed on the *Map* layer and moved or rotated with ✋. An object can also **emit light** (a campfire, a candle): select it and choose the light in its panel.
  - **🌲 Scatter**: instead of one by one, drag to scatter many at once (a forest, a field of rocks, an ossuary). Pick one or more objects, or a ready-made mix (*Trees*, *Jungle*, *Rocks*, *Flowers*, *Bones*, *Rubble*), the brush size and the amount. They don't pile up, and on painted floor they don't land in walls or empty space. **Shift + drag** removes objects along your path.
- **🏛️ Prefab rooms** (S): tavern, shop, inn room, smithy, square with fountain, temple, throne room, library, burial chamber, cells, ritual altar and camp. Click on the map and the room appears with its floor, walls, doors (the cells' doors are locked), furniture and lights; **T** (or *↻ Rotate*) rotates it before placing. Afterwards you can tweak it like anything else. The outdoor ones (square and camp) have no walls: they look best on grass or dirt you've already painted.
- **Random generation**, at the scene's size. Choose the style:
  - **🏰 Dungeon**: stone rooms and cobblestone corridors.
  - **⚰️ Crypt**: tombs, ossuaries and candlelit chapels.
  - **👑 Castle**: large marble halls, such as the throne room, dining hall, armoury or library.
  - **🌊 Sewers**: water channels between cobblestone rooms.
  - **⛏️ Mine**: dirt tunnels between chambers with ore veins and cave-ins.
  - **🕳️ Cave**: natural, surrounded by rock.
  - Outdoors (all floor, no surrounding walls):
    - **🌲 Forest**: groves with a path running through, a clearing (sometimes with a camp and campfire, or ruins) and maybe a pond with a footbridge.
    - **🛤️ Road**: a road between groves, sometimes crossed by a river with a bridge, and an overturned cart in the middle: ready for an ambush.
    - **🏘️ Village**: dirt streets, a square with a well, street lamps and stalls, and wooden houses with walls and a door facing the street. The one closest to the square is the tavern; then shop, smithy, temple, stable and homes, each with its furniture.

  You can also choose the size: how many rooms (few, normal or many), how dense the forest is or how many houses the village has. With **Furnish** (on by default), each room gets a purpose (storeroom, barracks, tombs, armoury…) and is filled with matching objects and a torch or candle that gives light, without blocking entrances or doors. **🎲 Generate** can be pressed as many times as you like: each time the previous map's furniture is removed (objects you placed by hand stay) and Ctrl+Z goes back to the previous one. *Clear* removes the floor and the generated furniture.
- **Undo and redo** with Ctrl+Z / Ctrl+Y, including objects and rooms you place.

With the editor open, zoom with the mouse wheel and pan with the middle or right mouse button. While it's open, letter keys are shortcuts for its tools (not the board's); **M** closes it.

## Character sheets

- **Characters** (right panel): the DM creates PCs and NPCs and chooses which players control them. A player can also create their own.
- NPCs are invisible to players unless you tick *All players can see the sheet*.
- Click 🎲 next to any value to roll it. Rolls are made on the server and the whole table sees them.
- **Character token**: drag the character from the list onto the board, or use *Place token on the board* on their sheet. The token shows its HP bar, and double-clicking it opens the sheet.
- **Editable template** (*⚙ Edit sheet template*): change sections, fields, formulas and rolls; load another built-in system, or import and export the template as JSON. 5e comes built in, but nothing is hard-coded.

Formula examples: `floor((fue - 10) / 2)`, `if(sigilo_comp, competencia, 0)`. Roll examples: `1d20 + @{fue_mod}`, `2d20kh1 + 5` (advantage), `@{dano}` (rolls whatever is written in the "dano" field). Field keys are the same in both languages (they are in Spanish: `fue` = Strength, `sigilo` = Stealth, `dano` = damage…).

### Action buttons and rests

Each row of the 5e sheet has its own button:

- **⚔ Attack** (attacks and weapons): rolls 1d20 + the bonus and the damage. With *Extra damage* (e.g. `1d6 fire` or `2d6 radiant`) a second damage roll appears in the same message.
  - If the d20 reaches *Crit on* (20 by default, 19 for a champion), all damage dice are doubled.
  - If the bonus isn't a number (e.g. "DC 13 DEX"), only the damage is rolled.
- **✨ Cast** (spells): spends a slot of the level you choose in the dropdown (by default, the lowest available) and rolls the spell's effect, whether damage or healing. Cantrips cost nothing. If there are no slots left, the button is disabled.
- **▶ Use** (*Resources and uses*): spends one use of features and items like rage, ki, channel divinity or wand charges. Each resource says whether it comes back on a **short** or **long rest**.
- **☾ Short rest** and **☀ Long rest** (sheet header):
  - A short rest restores short-rest resources, and also spell slots if *Pact slots* (warlock) is ticked.
  - A long rest also restores HP, all spell slots and long-rest resources, and removes temporary HP.
  - The chat reports what was recovered.

Sheets from older campaigns get these fields automatically the first time they're opened. In the template, the *Combat, health bars, action buttons and enemy AI* section defines which columns are extra damage, crit range, spells, slots and resources. Enemy AI also uses extra damage and crit range.

### HP, AC and conditions on tokens

Tokens linked to a sheet show their **health bar** on top: green, yellow or red depending on what's left, with **temporary HP** in blue at the end. In the bottom-left corner they have a **shield showing their AC**.

- **What players see** is chosen by the DM per token (item panel → *What players see*):
  - **Health**: DM only, bar without numbers (approximate proportion) or bar and numbers.
  - **AC**: DM only or everyone.
  - By default, players' characters' HP and AC are visible to everyone, and enemies' only to the DM.
  - *Apply to the N enemies in the scene* copies the choice to every enemy at once.
  - Hidden information is shown dimmed to the DM, with 🙈.
- **Security**: the server only sends each player what they're allowed to see, and only updates it when the sheet changes (damage, healing…).
- **Conditions**: buffs (Blessed, Hasted, Bardic Inspiration, Shield of Faith, Rage, Heroism, Damage resistance) get a green ring and debuffs a red ring.
- **Template**: in *Combat, health bars, action buttons and enemy AI* you choose which field holds temporary HP.

### Manual damage and healing

The DM can deal damage or heal without using a creation: select a token (or place an area template over several) and, in the item panel, under **❤ Damage and healing**:

- Enter the **amount**: a number (`8`) or a roll (`2d6 + 3`), which is rolled on the server. Enter applies damage.
- For damage, choose the **type** (fire, slashing…) so **resistances, immunities and vulnerabilities** apply; leave it empty for untyped damage. Damage types work in either language ("fire" and "fuego" are the same).
- **🩸 Damage** subtracts **temporary HP** first and then HP, never going below 0. **💚 Heal** adds HP without exceeding the maximum.
- If the target is **concentrating**, it rolls its saving throw just like with any other damage.
- A summary appears in the chat; if any token is on the DM layer, only the DM sees it.

## Chat, rolls and initiative

- **Chat** (default tab): type normally or use commands: `/r 1d20+5 Attack`, `/gr 1d20` (secret roll to the DM), `/w Ana text` (whisper), `/em hides`. ↑ recalls your last message, and the selector lets you speak as your character.
- All rolls (from sheets or the chat) are kept in the chat.
- **Automatic initiative**: the DM clicks **🎲 Roll for all** and 1d20 + the initiative bonus from each scene token's sheet is rolled (no sheet: 1d20). The list sorts itself; ties go to the higher bonus. The DM can also roll only for the *🎲 Missing ones* or only for *🎲 Enemies*. Tokens on the DM layer are added hidden and only the DM sees their roll.
- When initiative is rolled, **everyone sees the order in large type** in the centre of the screen, with each one's die and bonus (and the summary stays in the chat). Players not yet on the list get **🎲 Roll my initiative**, or can roll from their sheet.
- Once combat has started, the top shows **whose turn it is and who's next** (and *It's your turn!* when it's yours). The active token is highlighted on the board and each player can end their own turn. The DM can still add tokens by hand and correct values.

### Crits and fumbles

When someone rolls a **natural 20** on a d20, the whole table sees a golden flash with "CRITICAL!" and sparks. A **natural 1** shows "FUMBLE!" in red and shakes the screen. With advantage or disadvantage only the kept die counts. Each person can turn off the animation or the sound in *Table → Effects*. Secret rolls and whispers are only seen by their recipients.

## Music and ambience

- In the **Table** tab, the DM uploads audio (MP3, OGG, WAV, M4A, FLAC; max 25 MB) and presses ▶. It plays for the whole table at once, in sync: anyone joining late hears it from where it currently is.
- Several tracks can play at once (music + rain), each with its own volume and either looping or playing once.
- Each player sets their own volume or mutes. If the browser blocks audio, a **🔈 Enable sound** button appears.

## Macros

- **⚙ Macros** (top right of the board): buttons with one or more chat lines, like `/em draws his sword` or `/r 1d20 + @{fue_mod} + @{competencia} Attack`.
- If the macro has no fixed character, it rolls with the **selected token's** character (if you control it). That way a single "Attack" macro works for all of the DM's NPCs.
- The DM can share macros with the whole table (they appear with ★).

## Journal

- **Journal** tab: the DM prepares documents (letters, clues, maps or descriptions) with simple formatted text (`# title`, `**bold**`, `*italic*`, `- list`) and an image.
- Each document has **DM notes**, which players never receive, and can be shared with everyone or with specific players.
- **👁 Show to the table** opens it on the screens of those who can see it. Afterwards they can reread it whenever they like from their Journal tab.

## Character creation and SRD rules

- **✨ Create 5e character** (*Characters* tab, for both DM and players) walks you through character creation in seven steps and creates a filled-in sheet:
  1. **Species** and subspecies, with their bonuses.
  2. **Class**, level (1–20) and subclass, with class skills and feature options (fighting style, draconic ancestry…).
  3. **Abilities**: standard array, point buy (27), 4d6 drop lowest, or manual.
  4. **Background**, alignment and languages.
  5. **Starting equipment**: the class and background choices. Equipment packs are unpacked into the inventory.
  6. **Spells**: cantrips and spells from the class list, limited to what the level allows.
  7. **Summary**: the name, and the sheet is created with HP, AC, saving throws, skills, attacks with their bonuses, spells, spell slots, inventory, proficiencies and features.

  Warnings (something not chosen, too many points spent…) don't block you, and everything can be adjusted later on the sheet.
- **📚 Rules** is a searchable compendium:
  - **Spells**: all 319, filterable by class and level.
  - **Items**: weapons, armour, gear, tools and magic items.
  - **Classes**: features by level, including subclass features.
  - **Species**: with their traits.

  **+ Sheet** adds a spell or item to the sheet you choose; if it's a weapon, also to its attacks.
- **Language**: in English, names and descriptions are the SRD's originals; in Spanish, names are translated and long descriptions stay in English.
- **Licence**: content from the D&D *System Reference Document 5.1*, © Wizards of the Coast, under the [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) licence. The data comes from [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT). It is regenerated with `node scripts/srd/build.mjs`; the Spanish translations live in `scripts/srd/es-*.mjs`, and `node scripts/srd/en-names.mjs` turns them back into English names for the English interface.

## Creations: custom spells, attacks and items

- In *Characters*, **⚗ Creations** opens the table's list of spells, attacks and items, with search. The DM sees all of them; each player sees their own and those the DM marks as *Shared*.
- **+ Spell / + Attack / + Item** opens the editor, where everything can be changed:
  - **Details**: level, school, casting time, range, components, duration, concentration and ritual (spells); category, rarity, weight, price, attunement and *consumable* (items).
  - **Attack roll** (melee or ranged) with its bonus and the number it crits on.
  - **Saving throw**: ability, DC and whether half damage is taken on a success.
  - **Damage** of several types, **healing** and, for spells, the dice added per higher slot level.
  - **Area** (sphere, cone, line or cube and its size), **conditions** applied to targets and caster status (concentration).
  - **Uses** and whether they come back on a short or long rest.
  - Formulas accept numbers or fields from the user's sheet, like `@{conj_cd}` or `@{competencia} + @{fue_mod}`.
- In **📚 Rules**, a spell or item's **✎** button copies it into Creations for tweaking (damage, saving throw, area and upcasting come pre-filled).
- **+ Sheet** adds it to a character: to their spells, attacks or inventory, and to *Resources and uses* if it has uses. Those rows stay **linked**: the sheet's ⚔, ✨ and ▶ buttons do whatever the creation says (even after editing it), spend the slot, use or potion, and enemy AI uses its attack. **▶** in the list uses it right away with the chosen character.
- In the chat, the message includes the saving throw, area and conditions:
  - **📐 Template** places the area template on the board at its size: click where it starts and drag to aim it.
  - **🎯 Apply** (DM) applies it to the tokens inside that template or, if there isn't one, to the selected token. Attacks are compared against AC; saving throws are rolled with each target's sheet (half or none on a success). Then damage is subtracted (temporary HP first), healing is added and conditions are applied. If any target is on the DM layer, only the DM sees the summary.
- Creations are included in backups (shared ones and the DM's).

## Monster compendium

- In *Characters*, the DM has **📖 Compendium**: 45 monsters from the SRD 5.1 (goblins, orcs, skeletons, ogres, trolls, a young red dragon…). Search by name (English or Spanish), or filter by CR.
- **+ Sheet** creates the NPC with a filled-in 5e sheet (AC, HP, ability scores, attacks, traits). **+ To board** also places its token at the correct size with AI already enabled and its behaviour set (archers shoot, goblins are cautious…). With *How many* you create several at once, each with its own sheet (Orc 1, Orc 2…).
- If you've changed the sheet template, only the fields that exist are filled in.

## Prepared encounters

In *Characters*, the DM has **⚔ Encounters**: groups of compendium monsters prepared in advance ("Goblin ambush: 4 goblins and a wolf").

- **+ New encounter**: search for monsters and add them with **+**, set how many of each and jot down notes (where they are, how they attack…). **🎲 Suggest one** proposes a random one at the difficulty you choose, and you can press it several times.
- **Difficulty**: each encounter says whether it's *easy*, *medium*, *hard* or *deadly* for your party, using the SRD 5.1 rules (monster XP, a multiplier based on how many there are, and per-level thresholds). The party is taken from the characters that have a player and from their level; you can change it by hand at the top.
- **▶ To board**: creates each monster's sheet (Goblin 1, Goblin 2…) and places their tokens, at the right size and with AI enabled, on free squares around the centre of your view, without crossing walls or overlapping anyone. With *Place them hidden (DM layer)* they go on the DM layer.
- Encounters belong to the campaign and are included in backups.

## Enemy AI

- Select a token (DM) and in **🤖 Enemy AI** tick *Acts on its own turn*. Choose its behaviour: *melee*, *ranged* (keeps its distance and shoots), *cautious* (flees when low on health) or *guardian* (waits until someone approaches), and who it targets: the nearest, the most wounded or random.
- If the token is linked to an NPC, it uses its sheet: speed, health and attack table. If not, enter its attack and damage in the same panel (e.g. `1d20 + 5` and `1d12 + 3`).
- On its initiative turn, press **🤖 Act**: the enemy pathfinds across the grid avoiding others and going around walls (and needs line of sight to attack its target), moves closer, rolls its attack against the target's AC and, if it hits, the damage. Everything is logged in the chat (secretly if the enemy is on the DM layer).
- **🤖 Automatic AI** (in the initiative panel): enemies with AI play their turn on their own and pass to the next, until it's a player's turn. **Apply damage** subtracts the damage from the character's HP.
- Which fields it uses (AC, HP, speed, attack table) is configured in *⚙ Edit sheet template → Combat, health bars, action buttons and enemy AI*, so it works with other systems too.

## Backups

- In the **⚙️ Settings** tab, the DM has **⬇ Download backup**: a `.vtt.json.gz` file with scenes and their folders, tokens, walls, fog, sheets, template, journal, shared macros, prepared encounters, music and the campaign language. With *Include images and music* it also contains the files (larger download). The chat is not saved.
- To restore it, on the campaign list click **⬆ Choose file** under *Restore a backup* (max 500 MB). A **new** campaign is created with you as DM: players aren't included in the backup, so you have to invite them again and assign their characters.
- It's also a way to move a campaign from one server to another (e.g. from your PC to the Raspberry Pi). The 📚 scene library belongs to you, not the campaign, so it isn't included in the backup: to move a single scene, use *⬇ Export* in the *Scenes* tab. On top of this, it's a good idea to copy the whole data folder from time to time (see *Installing on a Raspberry Pi 5*).

## Development

Requirements: Node 22+ and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # server on :3000 and web on http://localhost:5173
pnpm test         # tests (API, real time and translations)
pnpm typecheck
pnpm build
```

### Quick launcher

`scripts/mesa.sh` wraps the above in a menu: open the app in the browser (`localhost:5173`), run the checks (types + tests), or both. It installs dependencies if needed. It also accepts `lanzar` (launch), `pruebas` (tests) or `todo` (all) as an argument. Press `Ctrl+C` to stop the app.

If you change the database schema (`apps/server/src/db/schema.ts`), generate the migration with `pnpm db:generate`. It is applied automatically on startup.

### Translations

Interface text is written in Spanish inside `tr('…')` and its English version lives in `packages/shared/src/i18n/en/`. A test fails if any text is missing its translation. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (*Idiomas*).

## Architecture

Overview in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (in Spanish). In short:

- `packages/shared`: types, validation, translations and the real-time event contract shared by the server and the web app.
- `apps/server`: Fastify + Socket.IO + SQLite (Drizzle). Each feature is a **module** in `src/modules/`.
- `apps/web`: React + Vite. Same module-based layout in `src/modules/`.

## License

The code is released under the [MIT License](LICENSE): anyone may use, copy, modify and share it freely, as long as the copyright notice is kept. The D&D rules content (SRD 5.1) keeps its own CC-BY-4.0 licence, described above.

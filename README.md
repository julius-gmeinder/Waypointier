this plugins is heavily inspired by the [Waypoint](https://github.com/IdreesInc/Waypoint) obsidian plugin, intended to be used **without [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes)**, but offering a similar experience by defining **Anchor-Notes** with regex.

## Usage

Instead of using folder-notes, you use regex to define your **Anchor-Notes**, only notes that match the regex can contain **Anchors**

Otherwise, the anchor functionality is basically a clone of [Waypoint](https://github.com/IdreesInc/Waypoint):
- `%% Anchor %%` triggers an Anchor to spawn.
- `%% Anchor Start %%` and `%% Anchor End %%` mark the bounds of the Anchor.

## Disclaimer

- I have used AI to develop this plugin, even though i have reviewed the code pretty thoroughly, expect unexpected behavior or bugs.
- If you come across and bugs, feel free to open an issue
- I am not affiliated with the original creator of [Waypoint](https://github.com/IdreesInc/Waypoint).
- Build from source
    1. clone the repository `git clone https://github.com/julius-gmeinder/anchor-notes.git`
    2. install dependencies `npm install`
    3. build the plugin `npm run build`
    4. copy the anchor-notes folder into your plugins folder
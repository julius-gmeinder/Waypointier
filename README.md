this is basically a functional clone of the [Waypoint](https://github.com/IdreesInc/Waypoint) obsidian plugin, intended to be used **without [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes)**, but offering a close match in experience.

## Usage

Instead of using folder-notes, you use regex to define which notes are allowed to contain a waypoint.

Otherwise, the functionality is identical:
- `%% Waypoint %%` triggers a waypoint to spawn.
- `%% Begin Waypoint %%` and `%% End Waypoint %%` mark the bounds of the waypoint.

## Disclaimer

- Currently, the plugin is stripped down to the bare minimum, only the features i have personally used before are implemented.
- I have used AI to develop this plugin, even though i have reviewed the code pretty thoroughly, expect unexpected behavior or bugs.
- I am not affiliated with the original creator of [Waypoint](https://github.com/IdreesInc/Waypoint).
- This project is (at the moment) intended for personal use only, if you want to use the plugin anyway
    1. clone the repository `git clone https://github.com/julius-gmeinder/Waypointier.git`
    2. install dependencies `npm install`
    3. build the plugin `npm run build`
    4. copy the waypointier folder into your plugins folder
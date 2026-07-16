import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

const WAYPOINT_START = "%% Begin Waypoint %%";
const WAYPOINT_END = "%% End Waypoint %%";
const WAYPOINT_TRIGGER = "%% Waypoint %%";

interface WaypointierSettings {
    allowedFileRegex: string;
    fileFilter: string;
    showExtensions: string;
}

const DEFAULT_SETTINGS: WaypointierSettings = {
    allowedFileRegex: '.*',
    fileFilter: 'native',
    showExtensions: 'non-md',
}

const EXTENSION_MAP: Record<string, string[]> = {
    'md': ['md'],
    'native': ['md', 'canvas', 'base'],
};

export default class Waypointier extends Plugin {
    settings: WaypointierSettings = DEFAULT_SETTINGS;
    knownWaypoints: Set<string> = new Set();

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new WaypointierSettingTab(this.app, this));

        const bubbleUp = async (startFolder: TFolder | null) => {
            let currentFolder = startFolder;
            
            while (currentFolder) {
                for (const child of currentFolder.children) {
                    if (child instanceof TFile && child.extension === 'md' && this.isAllowedFile(child)) {
                        const content = await this.app.vault.cachedRead(child);

                        if (content.includes(WAYPOINT_START) || content.includes(WAYPOINT_TRIGGER)) {
                            this.knownWaypoints.add(child.path);
                            await this.updateWaypoint(child);
                        }
                    }
                }
                
                currentFolder = currentFolder.parent;
            }
        };

        this.registerEvent(this.app.vault.on('modify', async (file) => {
            if (file instanceof TFile && file.extension === 'md' && this.isAllowedFile(file)) {
                const content = await this.app.vault.read(file);
                const hasWaypoint = content.includes(WAYPOINT_START) || content.includes(WAYPOINT_TRIGGER);
                
                let statusChanged = false;

                if (hasWaypoint) {
                    if (!this.knownWaypoints.has(file.path)) {
                        this.knownWaypoints.add(file.path);
                        statusChanged = true;
                    }
                    await this.updateWaypoint(file);
                } else {
                    if (this.knownWaypoints.has(file.path)) {
                        this.knownWaypoints.delete(file.path);
                        statusChanged = true;
                    }
                }

                if (statusChanged && file.parent) {
                    bubbleUp(file.parent);
                }
            }
        }));

        this.registerEvent(this.app.vault.on('create', (file) => {
            if (file.parent)
                bubbleUp(file.parent);
        }));
        
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (file instanceof TFile)
                this.knownWaypoints.delete(file.path);

            if (file.parent)
                bubbleUp(file.parent);
        }));
        
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile)
                this.knownWaypoints.delete(oldPath);

            if (file.parent)
                bubbleUp(file.parent);
            
            const oldParentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
            const oldParent = this.app.vault.getAbstractFileByPath(oldParentPath || '/');

            if (oldParent instanceof TFolder)
                bubbleUp(oldParent);
        }));
    }

    isAllowedFile(file: TFile): boolean {
        try {
            const regex = new RegExp(this.settings.allowedFileRegex);
            return regex.test(file.name);
        } catch (e) {
            console.error("Invalid regex in Waypointier settings", e);
            return true;
        }
    }

    shouldIncludeFile(file: TFile): boolean {
        if (this.settings.fileFilter === 'all')
            return true;
        
        const allowedExtensions = EXTENSION_MAP[this.settings.fileFilter] || ['md'];
        return allowedExtensions.includes(file.extension.toLowerCase());
    }

    getDisplayName(file: TFile): string {
        switch (this.settings.showExtensions) {
            case 'all': 
                return file.name;
            case 'non-md': 
                return file.extension.toLowerCase() === 'md' ? file.basename : file.name;
            case 'none':
            default:
                return file.basename;
        }
    }

    async updateWaypoint(file: TFile) {
        if (!this.isAllowedFile(file))
            return;

        const originalContent = await this.app.vault.read(file);
        let content = originalContent;
        
        const startIndex = content.indexOf(WAYPOINT_START);
        const endIndex = content.indexOf(WAYPOINT_END, startIndex);
        const triggerIndex = content.indexOf(WAYPOINT_TRIGGER);
        
        if (triggerIndex === -1 && (startIndex === -1 || endIndex === -1))
            return;
        
        if (!file.parent)
            return;

        const tree = await this.buildTree(file.parent, file.path);
        const newBlock = `${WAYPOINT_START}\n${tree}\n${WAYPOINT_END}`;

        if (triggerIndex !== -1) {
            content = content.substring(0, triggerIndex) + newBlock + content.substring(triggerIndex + WAYPOINT_TRIGGER.length);
        } else if (startIndex !== -1 && endIndex !== -1) {
            content = content.substring(0, startIndex) + newBlock + content.substring(endIndex + WAYPOINT_END.length);
        }

        if (content !== originalContent) {
            await this.app.vault.modify(file, content);
        }
    }

    async buildTree(folder: TFolder, originPath: string, indent = ""): Promise<string> {
        let treeString = "";
        
        const children = folder.children.slice().sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;

            if (aIsFolder && !bIsFolder)
                return -1;

            if (!aIsFolder && bIsFolder)
                return 1;

            return a.name.localeCompare(b.name);
        });

        for (const child of children) {
            if (child instanceof TFolder) {
                let boundaryFiles: TFile[] = [];
                
                for (const sub of child.children) {
                    if (sub instanceof TFile && sub.extension === 'md' && this.isAllowedFile(sub)) {
                        const subContent = await this.app.vault.cachedRead(sub);

                        if (subContent.includes(WAYPOINT_TRIGGER) || subContent.includes(WAYPOINT_START)) {
                            this.knownWaypoints.add(sub.path);
                            boundaryFiles.push(sub);
                        }
                    }
                }
                
                if (boundaryFiles.length > 0) {
                    boundaryFiles.sort((a, b) => a.name.localeCompare(b.name));
                    const links = boundaryFiles.map(bf => `**[[${bf.path}|${this.getDisplayName(bf)}]]**`).join(' ');
                    treeString += `${indent}- ${links}\n`;
                } else {
                    treeString += `${indent}- **${child.name}**\n`;
                    treeString += await this.buildTree(child, originPath, indent + "    ");
                }

            } else if (child instanceof TFile) {
                if (child.path === originPath)
                    continue; 

                if (this.shouldIncludeFile(child)) {
                    treeString += `${indent}- [[${child.path}|${this.getDisplayName(child)}]]\n`;
                }
            }
        }

        return treeString;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class WaypointierSettingTab extends PluginSettingTab {
    plugin: Waypointier;

    constructor(app: App, plugin: Waypointier) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Allowed Files Regex')
            .setDesc('Only files matching this Regex can trigger/contain Waypoints. (e.g., ^__.*)')
            .addText(text => text
                .setPlaceholder('.*')
                .setValue(this.plugin.settings.allowedFileRegex)
                .onChange(async (value) => {
                    this.plugin.settings.allowedFileRegex = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Included File Types')
            .setDesc('Choose which files show up in the Waypoint list.')
            .addDropdown(drop => drop
                .addOption('md', 'Markdown (.md)')
                .addOption('native', 'Obsidian Natives (.md, .canvas, .base)')
                .addOption('all', 'All Files')
                .setValue(this.plugin.settings.fileFilter)
                .onChange(async (value) => {
                    this.plugin.settings.fileFilter = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Extensions')
            .setDesc('Choose how file extensions are displayed in the Waypoint list.')
            .addDropdown(drop => drop
                .addOption('none', 'Display no extensions')
                .addOption('non-md', 'Display only non .md extensions')
                .addOption('all', 'Display all extensions')
                .setValue(this.plugin.settings.showExtensions)
                .onChange(async (value) => {
                    this.plugin.settings.showExtensions = value;
                    await this.plugin.saveSettings();
                }));
    }
}
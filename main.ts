import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

const ANCHOR_START = "%% Begin Anchor %%";
const ANCHOR_END = "%% End Anchor %%";
const ANCHOR_TRIGGER = "%% Anchor %%";

interface AnchorNotesSettings {
    allowedFileRegex: string;
    fileFilter: string;
    showExtensions: string;
}

const DEFAULT_SETTINGS: AnchorNotesSettings = {
    allowedFileRegex: '.*',
    fileFilter: 'native',
    showExtensions: 'non-md',
}

const EXTENSION_MAP: Record<string, string[]> = {
    'md': ['md'],
    'native': ['md', 'canvas', 'base'],
};

export default class AnchorNotes extends Plugin {
    settings: AnchorNotesSettings = DEFAULT_SETTINGS;
    knownAnchors: Set<string> = new Set();
    compiledRegex: RegExp = /.*/;
    
    private writeQueue: Promise<void> = Promise.resolve();
    private modifyTimers = new Map<string, number>();

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new AnchorNotesSettingTab(this.app, this));

        this.app.workspace.onLayoutReady(async () => {
            this.registerEvent(this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md' && this.isAllowedFile(file)) {
                    this.queueModifyCheck(file);
                }
            }));
    
            this.registerEvent(this.app.vault.on('create', (file) => {
                if (file.parent) {
                    this.bubbleUp(file.parent);
                }
            }));
            
            this.registerEvent(this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    this.knownAnchors.delete(file.path);
                }
                
                const parentPath = file.path.substring(0, file.path.lastIndexOf('/'));
                const parentFolder = this.app.vault.getAbstractFileByPath(parentPath || '/');
                
                if (parentFolder instanceof TFolder) {
                    this.bubbleUp(parentFolder);
                }
            }));
            
            this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    this.knownAnchors.delete(oldPath);
                }

                if (file.parent) {
                    this.bubbleUp(file.parent);
                }
                
                const oldParentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
                const oldParent = this.app.vault.getAbstractFileByPath(oldParentPath || '/');

                if (oldParent instanceof TFolder) {
                    this.bubbleUp(oldParent);
                }
            }));
        });
    }

    private queueModifyCheck(file: TFile) {
        window.clearTimeout(this.modifyTimers.get(file.path));
        
        this.modifyTimers.set(file.path, window.setTimeout(async () => {
            const content = await this.app.vault.read(file);
            const hasAnchor = content.includes(ANCHOR_START) || content.includes(ANCHOR_TRIGGER);
            
            let statusChanged = false;

            if (hasAnchor) {
                if (!this.knownAnchors.has(file.path)) {
                    this.knownAnchors.add(file.path);
                    statusChanged = true;
                }
                await this.updateAnchor(file);
            } else {
                if (this.knownAnchors.has(file.path)) {
                    this.knownAnchors.delete(file.path);
                    statusChanged = true;
                }
            }

            if (statusChanged && file.parent) {
                this.bubbleUp(file.parent);
            }
        }, 1000));
    }

    async bubbleUp(startFolder: TFolder | null) {
        let currentFolder = startFolder;
        
        while (currentFolder) {
            for (const child of currentFolder.children) {
                if (child instanceof TFile && child.extension === 'md' && this.isAllowedFile(child)) {
                    const content = await this.app.vault.cachedRead(child);

                    if (content.includes(ANCHOR_START) || content.includes(ANCHOR_TRIGGER)) {
                        this.knownAnchors.add(child.path);
                        await this.updateAnchor(child);
                    }
                }
            }
            currentFolder = currentFolder.parent;
        }
    }

    updateRegex() {
        try {
            this.compiledRegex = new RegExp(this.settings.allowedFileRegex);
        } catch (e) {
            console.error("Invalid regex in AnchorNotes settings", e);
            this.compiledRegex = /.*/; 
        }
    }

    isAllowedFile(file: TFile): boolean {
        return this.compiledRegex.test(file.name);
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

    private async queuedWrite(file: TFile, content: string) {
        this.writeQueue = this.writeQueue.then(async () => {
            const current = await this.app.vault.read(file);

            if (current !== content) {
                await this.app.vault.modify(file, content);
            }
        }).catch(console.error);

        return this.writeQueue;
    }

    async updateAnchor(file: TFile) {
        if (!this.isAllowedFile(file)) {
            return;
        }

        const originalContent = await this.app.vault.read(file);
        
        const triggerIndex = originalContent.indexOf(ANCHOR_TRIGGER);
        const startIndex = originalContent.indexOf(ANCHOR_START);
        
        if (triggerIndex === -1 && startIndex === -1) {
            return;
        }

        if (!file.parent) {
            return;
        }

        const tree = await this.buildTree(file.parent, file.path);
        const newBlock = `${ANCHOR_START}\n${tree}\n${ANCHOR_END}`;

        const blockRegex = new RegExp(`${ANCHOR_START}[\\s\\S]*?${ANCHOR_END}`, 'g');
        const triggerRegex = new RegExp(ANCHOR_TRIGGER, 'g');

        const insertPos = triggerIndex !== -1 ? triggerIndex : startIndex;
        
        let before = originalContent.substring(0, insertPos);
        let after = originalContent.substring(insertPos);

        before = before.replace(blockRegex, '').replace(triggerRegex, '');
        after = after.replace(blockRegex, '').replace(triggerRegex, '');

        const content = before + newBlock + after;

        if (content !== originalContent) {
            await this.queuedWrite(file, content);
        }
    }

    async buildTree(folder: TFolder, originPath: string, indent = ""): Promise<string> {
        let treeString = "";
        
        const children = folder.children.slice().sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;

            if (aIsFolder && !bIsFolder) {
                return -1;
            }

            if (!aIsFolder && bIsFolder) {
                return 1;
            }

            return a.name.localeCompare(b.name);
        });

        for (const child of children) {
            if (child instanceof TFolder) {
                let boundaryFiles: TFile[] = [];
                
                for (const sub of child.children) {
                    if (sub instanceof TFile && sub.extension === 'md' && this.isAllowedFile(sub)) {
                        const subContent = await this.app.vault.cachedRead(sub);

                        if (subContent.includes(ANCHOR_TRIGGER) || subContent.includes(ANCHOR_START)) {
                            this.knownAnchors.add(sub.path);
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
                if (child.path === originPath) {
                    continue; 
                }

                if (this.shouldIncludeFile(child)) {
                    treeString += `${indent}- [[${child.path}|${this.getDisplayName(child)}]]\n`;
                }
            }
        }

        return treeString;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.updateRegex();
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateRegex();
    }
}

class AnchorNotesSettingTab extends PluginSettingTab {
    plugin: AnchorNotes;

    constructor(app: App, plugin: AnchorNotes) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Allowed Files Regex')
            .setDesc('Only files matching this Regex can trigger/contain Anchors. (e.g., ^__.*)')
            .addText(text => text
                .setPlaceholder('.*')
                .setValue(this.plugin.settings.allowedFileRegex)
                .onChange(async (value) => {
                    this.plugin.settings.allowedFileRegex = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Included File Types')
            .setDesc('Choose which files show up in the Anchor list.')
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
            .setDesc('Choose how file extensions are displayed in the Anchor list.')
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
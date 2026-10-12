const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ICON_PATH = path.join(__dirname, 'Images', 'app.png');

function getAvailableDrives() {
    const drives = [];
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const root = `${letter}:/`;
        try {
            if (fs.existsSync(root)) {
                drives.push(`${letter}:`);
            }
        } catch (_) {}
    }
    return drives;
}

function normalizePath(raw) {
    if (!raw) return '';
    let p = raw.trim().replace(/\\/g, '/');
    if (/^[a-zA-Z]:$/.test(p)) {
        p += '/';
    }
    return p;
}

function listSubdirectories(dirPath) {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
            .filter((entry) => {
                if (!entry.isDirectory()) return false;
                if (entry.name.startsWith('$') || entry.name.toLowerCase() === 'system volume information') {
                    return false;
                }
                return true;
            })
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch (_) {
        return [];
    }
}

function getActiveActionKeyword() {
    try {
        const settingsPath = path.join(process.env.APPDATA || '', 'FlowLauncher', 'Settings', 'Settings.json');
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const plugins = data?.PluginSettings?.Plugins;
            if (plugins) {
                const targetId = '985f72b9-3b96-41a8-9bcb-07f3fe27c03b'.replace(/-/g, '').toLowerCase();
                for (const key of Object.keys(plugins)) {
                    if (key.replace(/-/g, '').toLowerCase() === targetId) {
                        const kwList = plugins[key]?.ActionKeywords;
                        if (Array.isArray(kwList) && kwList.length > 0 && kwList[0]) {
                            return kwList[0];
                        }
                    }
                }
            }
        }
    } catch (_) {}

    try {
        const manifestPath = path.join(__dirname, 'plugin.json');
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (manifest.ActionKeyword) return manifest.ActionKeyword;
        }
    } catch (_) {}

    return 'vc';
}

function handleQuery(request) {
    const rawParam = Array.isArray(request.parameters) ? String(request.parameters[0] || '').trim() : '';
    const query = normalizePath(rawParam);
    const trigger = getActiveActionKeyword();

    // Initial query when user just typed the trigger word
    if (!query) {
        const actualFolder = normalizePath(process.env.USERPROFILE || 'C:/');
        const results = [
            {
                Title: 'select folder as workdir',
                Subtitle: `Open OpenCode in ${actualFolder}`,
                IcoPath: ICON_PATH,
                JsonRPCAction: {
                    method: 'launch_here',
                    parameters: [actualFolder],
                    dontHideAfterAction: false,
                    DontHideAfterAction: false,
                },
            },
        ];

        for (const drive of getAvailableDrives()) {
            results.push({
                Title: drive,
                Subtitle: `Browse ${drive}/`,
                IcoPath: ICON_PATH,
                JsonRPCAction: {
                    method: 'Flow.Launcher.ChangeQuery',
                    parameters: [`${trigger} ${drive}/`, true],
                    dontHideAfterAction: true,
                    DontHideAfterAction: true,
                },
            });
        }

        return results;
    }

    let targetDir = query;
    let filter = '';

    if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
        if (!targetDir.endsWith('/')) targetDir += '/';
    } else {
        const lastSlash = targetDir.lastIndexOf('/');
        if (lastSlash !== -1) {
            const parent = targetDir.substring(0, lastSlash + 1);
            if (fs.existsSync(parent) && fs.statSync(parent).isDirectory()) {
                filter = targetDir.substring(lastSlash + 1).toLowerCase();
                targetDir = parent;
            }
        }
    }

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        return [
            {
                Title: 'Folder not found',
                Subtitle: query,
                IcoPath: ICON_PATH,
            },
        ];
    }

    const cleanDisplayDir = targetDir.endsWith('/') ? targetDir : `${targetDir}/`;
    const results = [
        {
            Title: 'select folder as workdir',
            Subtitle: `Open OpenCode in ${cleanDisplayDir}`,
            IcoPath: ICON_PATH,
            JsonRPCAction: {
                method: 'launch_here',
                parameters: [cleanDisplayDir],
                dontHideAfterAction: false,
                DontHideAfterAction: false,
            },
        },
    ];

    let subdirs = listSubdirectories(targetDir);
    if (filter) {
        subdirs = subdirs.filter((name) => name.toLowerCase().includes(filter));
    }

    for (const name of subdirs) {
        const nextQuery = `${cleanDisplayDir}${name}/`;
        results.push({
            Title: name,
            Subtitle: `Browse ${nextQuery}`,
            IcoPath: ICON_PATH,
            JsonRPCAction: {
                method: 'Flow.Launcher.ChangeQuery',
                parameters: [`${trigger} ${nextQuery}`, true],
                dontHideAfterAction: true,
                DontHideAfterAction: true,
            },
        });
    }

    if (results.length === 1 && !filter) {
        results.push({
            Title: 'No subfolders',
            Subtitle: `Press Enter on 'select folder as workdir' to open this directory.`,
            IcoPath: ICON_PATH,
        });
    }

    return results;
}

function launchHere(folderPath) {
    if (!folderPath) return [];
    const winPath = path.win32.normalize(folderPath.replace(/\//g, '\\'));

    try {
        const visible = spawn('cmd.exe', [
            '/c',
            'start',
            '',
            'powershell.exe',
            '-ExecutionPolicy',
            'Bypass',
            '-NoExit',
            '-Command',
            'opencode',
        ], {
            cwd: winPath,
            detached: true,
            stdio: 'ignore',
        });
        visible.unref();
    } catch (_) {}

    try {
        const bg = spawn('powershell.exe', [
            '-ExecutionPolicy',
            'Bypass',
            '-WindowStyle',
            'Hidden',
            '-NoProfile',
            '-Command',
            'omniroute',
        ], {
            cwd: winPath,
            detached: true,
            stdio: 'ignore',
        });
        bg.unref();
    } catch (_) {}

    return [];
}

function main() {
    let request;
    try {
        request = JSON.parse(process.argv[2] || '{}');
    } catch (_) {
        request = {};
    }

    const method = request.method || 'query';
    let response;

    if (method === 'launch_here') {
        const target = Array.isArray(request.parameters) ? request.parameters[0] : '';
        response = launchHere(target);
    } else {
        response = handleQuery(request);
    }

    process.stdout.write(`${JSON.stringify({ result: response })}\n`);
}

main();

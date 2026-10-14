const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ICON_PATH = path.join(__dirname, 'Images', 'app.svg');

const PROVIDERS = {
    copilot: {
        name: 'Copilot',
        keywords: ['Copilot'],
        url: 'https://copilot.microsoft.com/',
    },
    gemini: {
        name: 'Gemini',
        keywords: ['Gemini'],
        url: 'https://gemini.google.com/app',
    },
    claude: {
        name: 'Claude',
        keywords: ['Claude'],
        url: 'https://claude.ai/new',
        incognitoUrl: 'https://claude.ai/new?incognito',
    },
    chatgpt: {
        name: 'ChatGPT',
        keywords: ['ChatGPT'],
        url: 'https://chatgpt.com/',
        incognitoUrl: 'https://chatgpt.com/?temporary-chat=true',
    },
};

function isOn(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        return v === 'true' || v === '1' || v === 'yes' || v === 'on';
    }
    if (typeof value === 'number') return value === 1;
    return false;
}

function getSettingsPath() {
    return path.join(
        process.env.APPDATA || '',
        'FlowLauncher',
        'Settings',
        'Plugins',
        path.basename(__dirname),
        'Settings.json',
    );
}

function loadSettings(requestSettings) {
    let fromFile = {};
    const settingsPath = getSettingsPath();
    try {
        if (fs.existsSync(settingsPath)) {
            fromFile = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
    } catch (_) {}

    const fromRequest = requestSettings && typeof requestSettings === 'object' ? requestSettings : {};
    const merged = { ...fromFile, ...fromRequest };

    if (Object.keys(fromRequest).length > 0) {
        try {
            fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8');
        } catch (_) {}
    }

    return merged;
}

function providerUrl(provider, settings) {
    if (isOn((settings || {}).tryIncognito) && provider.incognitoUrl) {
        return provider.incognitoUrl;
    }
    return provider.url;
}

function promptFrom(parameters) {
    return parameters
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/^imgai\s*/i, '')
        .trim();
}

function delayFrom(settings) {
    const value = Number.parseInt(String(settings.delaySeconds || '3'), 10);
    if (!Number.isFinite(value)) return 3;
    return Math.min(20, Math.max(1, value));
}

function makeResult(id, provider, prompt, settings) {
    const isIncognito = isOn(settings.tryIncognito) && Boolean(provider.incognitoUrl);
    const url = isIncognito ? provider.incognitoUrl : provider.url;
    return {
        Title: `Send to ${provider.name}${isIncognito ? ' (incognito)' : ''}`,
        Subtitle: prompt
            ? `Take screenshot, then send: ${prompt}`
            : 'Take screenshot and send',
        IcoPath: ICON_PATH,
        JsonRPCAction: {
            method: 'send_to',
            parameters: [id, prompt, url],
            dontHideAfterAction: false,
            DontHideAfterAction: false,
        },
    };
}

function handleQuery(request) {
    const parameters = Array.isArray(request.parameters) ? request.parameters : [];
    const prompt = promptFrom(parameters);
    const settings = loadSettings(request.settings);

    return Object.entries(PROVIDERS)
        .filter(([id]) => {
            const enabled = settings[`show_${id}`];
            return enabled === undefined || (enabled !== false && enabled !== 'false');
        })
        .map(([id, provider]) => makeResult(id, provider, prompt, settings));
}

function sendTo(providerId, prompt, settings, urlOverride) {
    const provider = PROVIDERS[String(providerId || '')];
    if (!provider) return [];

    const effectiveSettings = loadSettings(settings);
    const url = typeof urlOverride === 'string' && urlOverride.startsWith('https://')
        ? urlOverride
        : providerUrl(provider, effectiveSettings);

    const promptFile = path.join(os.tmpdir(), `imgai-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, String(prompt || ''), 'utf8');

    const child = spawn('cmd.exe', [
        '/c',
        'start',
        '',
        'powershell.exe',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        path.join(__dirname, 'send.ps1'),
    ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: {
            ...process.env,
            IMGAI_URL: url,
            IMGAI_PROMPT_FILE: promptFile,
            IMGAI_KEYWORDS: (provider.keywords || [provider.name]).join(','),
        },
    });
    child.unref();
    return [];
}

function main() {
    let request;
    try {
        request = JSON.parse(process.argv[2] || '{}');
    } catch (_) {
        request = {};
    }

    const parameters = Array.isArray(request.parameters) ? request.parameters : [];
    const method = request.method || 'query';
    const result = method === 'send_to'
        ? sendTo(parameters[0], parameters[1], request.settings, parameters[2])
        : handleQuery(request);

    process.stdout.write(`${JSON.stringify({ result })}\n`);
}

main();

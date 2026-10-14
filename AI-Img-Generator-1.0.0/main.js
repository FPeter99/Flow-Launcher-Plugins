const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ICON_PATH = path.join(__dirname, 'Images', 'app.svg');

const PROVIDERS = {
    chatgpt: {
        name: 'ChatGPT',
        keywords: ['ChatGPT'],
        url: 'https://chatgpt.com/',
    },
    grok: {
        name: 'Grok',
        keywords: ['Grok'],
        url: 'https://grok.com/',
    },
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
    meta: {
        name: 'Meta AI',
        keywords: ['Meta AI', 'Meta.ai'],
        url: 'https://www.meta.ai/',
    },
};

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

function promptFrom(parameters) {
    return parameters
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/^imggen\s*/i, '')
        .trim();
}

function formatPrompt(userPrompt) {
    return `Generate an image from this: ${userPrompt}`;
}

function makeResult(id, provider, userPrompt) {
    const finalPrompt = formatPrompt(userPrompt);

    return {
        Title: `Generate with ${provider.name}`,
        Subtitle: finalPrompt,
        IcoPath: ICON_PATH,
        JsonRPCAction: {
            method: 'generate_image',
            parameters: [id, finalPrompt, provider.url],
            dontHideAfterAction: false,
            DontHideAfterAction: false,
        },
    };
}

function handleQuery(request) {
    const parameters = Array.isArray(request.parameters) ? request.parameters : [];
    const userPrompt = promptFrom(parameters);
    const settings = loadSettings(request.settings);

    if (!userPrompt) {
        return [{
            Title: 'AI Image Generator',
            Subtitle: 'Type what you want to generate (example: imggen gördeszkázó kutya)',
            IcoPath: ICON_PATH,
        }];
    }

    return Object.entries(PROVIDERS)
        .filter(([id]) => {
            const enabled = settings[`show_${id}`];
            return enabled === undefined || (enabled !== false && enabled !== 'false');
        })
        .map(([id, provider]) => makeResult(id, provider, userPrompt));
}

function generateImage(providerId, finalPrompt, settings, urlOverride) {
    const provider = PROVIDERS[String(providerId || '')];
    if (!provider) return [];

    const url = typeof urlOverride === 'string' && urlOverride.startsWith('https://')
        ? urlOverride
        : provider.url;

    const promptFile = path.join(os.tmpdir(), `imggen-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, String(finalPrompt || ''), 'utf8');

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
            IMGGEN_URL: url,
            IMGGEN_PROMPT_FILE: promptFile,
            IMGGEN_KEYWORDS: (provider.keywords || [provider.name]).join(','),
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
    const result = (method === 'generate_image' || method === 'send_to')
        ? generateImage(parameters[0], parameters[1], request.settings, parameters[2])
        : handleQuery(request);

    process.stdout.write(`${JSON.stringify({ result })}\n`);
}

main();

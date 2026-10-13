const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ICON_PATH = path.join(__dirname, 'Images', 'app.svg');

const PROVIDERS = {
    copilot: {
        name: 'Copilot',
        url: 'https://copilot.microsoft.com/',
    },
    gemini: {
        name: 'Gemini',
        url: 'https://gemini.google.com/app',
    },
    claude: {
        name: 'Claude',
        url: 'https://claude.ai/new',
    },
    chatgpt: {
        name: 'ChatGPT',
        url: 'https://chatgpt.com/',
    },
};

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

function makeResult(id, provider, prompt) {
    return {
        Title: `Send to ${provider.name}`,
        Subtitle: prompt
            ? `Paste clipboard image, then send: ${prompt}`
            : 'Paste the clipboard image',
        IcoPath: ICON_PATH,
        JsonRPCAction: {
            method: 'send_to',
            parameters: [id, prompt],
            dontHideAfterAction: false,
            DontHideAfterAction: false,
        },
    };
}

function handleQuery(request) {
    const parameters = Array.isArray(request.parameters) ? request.parameters : [];
    const prompt = promptFrom(parameters);
    const settings = request.settings || {};

    return Object.entries(PROVIDERS)
        .filter(([id]) => {
            const enabled = settings[`show_${id}`];
            return enabled === undefined || (enabled !== false && enabled !== 'false');
        })
        .map(([id, provider]) => makeResult(id, provider, prompt));
}

function sendTo(providerId, prompt, settings) {
    const provider = PROVIDERS[String(providerId || '')];
    if (!provider) return [];

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
            IMGAI_URL: provider.url,
            IMGAI_PROMPT_FILE: promptFile,
            IMGAI_DELAY: String(delayFrom(settings || {})),
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
        ? sendTo(parameters[0], parameters[1], request.settings)
        : handleQuery(request);

    process.stdout.write(`${JSON.stringify({ result })}\n`);
}

main();

const { spawn } = require('node:child_process');
const path = require('node:path');

const ICON_PATH = path.join(__dirname, 'Images', 'app.svg');

const BROKERS = {
    lightyear: {
        name: 'Lightyear',
        url: 'https://lightyear.com/portfolio',
    },
    trading212: {
        name: 'Trading 212',
        aliases: ['trading 212', 'trading212'],
        url: 'https://app.trading212.com/',
    },
    interactivebrokers: {
        name: 'IBKR',
        url: 'https://www.interactivebrokers.com/portal/',
    },
    degiro: {
        name: 'DEGIRO',
        url: 'https://trader.degiro.nl/',
    },
    binance: {
        name: 'Binance',
        url: 'https://www.binance.com/en/my/dashboard',
    },
    plus500: {
        name: 'Plus500',
        url: 'https://app.plus500.com/',
    },
};

function normalizeBroker(value) {
    return String(value || 'lightyear').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function makeResult(broker) {
    return {
        Title: `Open ${broker.name} portfolio`,
        Subtitle: broker.url,
        IcoPath: ICON_PATH,
        JsonRPCAction: {
            method: 'open_portfolio',
            parameters: [broker.id],
            dontHideAfterAction: false,
            DontHideAfterAction: false,
        },
    };
}

function handleQuery(request) {
    const parameters = Array.isArray(request.parameters) ? request.parameters : [];
    const query = parameters.map((value) => String(value || '').trim()).filter(Boolean).join(' ').toLowerCase();
    const filter = query === 'pf' || query.startsWith('pf ') ? query.slice(2).trim() : query;

    const settings = request.settings || {};
    return Object.entries(BROKERS)
        .filter(([id]) => {
            const enabled = settings[`show_${id}`];
            return enabled === undefined || (enabled !== false && enabled !== 'false');
        })
        .filter(([, broker]) => !filter || [broker.name, ...(broker.aliases || [])]
            .some((name) => name.toLowerCase().includes(filter)))
        .map(([id, broker]) => makeResult({ ...broker, id }));
}

function openPortfolio(brokerId) {
    const broker = BROKERS[normalizeBroker(brokerId)];
    if (!broker) {
        return [];
    }

    const child = spawn('cmd.exe', ['/c', 'start', '', broker.url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    });
    child.on('error', (error) => {
        process.stderr.write(`Failed to open broker portfolio: ${error.message}\n`);
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

    const method = request.method || 'query';
    const result = method === 'open_portfolio'
        ? openPortfolio(Array.isArray(request.parameters) ? request.parameters[0] : '')
        : handleQuery(request);

    process.stdout.write(`${JSON.stringify({ result })}\n`);
}

main();

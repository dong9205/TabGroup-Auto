const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const root = path.join(__dirname, '..');
const snapshotPath = 'TabGroup Auto/bookmarks/device-a.md';

function setup(missingNoteCode = 428) {
    const event = () => ({ addListener() {} });
    const settings = {
        syncBackend: 'fns', syncFnsBaseUrl: 'https://notes.example.test/api/',
        syncFnsToken: 'test-token', syncFnsVault: 'One Vault', syncPassphrase: 'test-password-123456',
        syncDeviceId: 'device-a', syncDeviceName: 'Edge A', defaultGroupTitle: 'Work',
        urlRules: [{ pattern: '*example*', groupId: 12, groupTitle: 'Work', autoMove: true }],
        groupSortSettings: { '12': { autoSort: true }, Other: { autoSort: false } }
    };
    const bar = { id: '1', title: '收藏夹栏', children: [
        { id: '2', title: 'Work', children: [
            { id: '3', title: 'Example', url: 'https://example.test/' },
            { id: '4', title: 'Nested', children: [{ id: '5', title: 'Second', url: 'https://second.test/' }] }
        ] },
        { id: '6', title: 'Example', url: 'https://example.test/' },
        { id: '7', title: 'Example', url: 'https://example.test/' },
        { id: '8', title: 'Empty', children: [] },
        { id: '9', title: 'Bookmarklet', url: 'javascript:alert(1)' },
        { id: '10', title: 'Managed', unmodifiable: 'managed', children: [] }
    ] };
    const other = { id: '20', title: 'Other bookmarks', children: [{ id: '21', title: 'Private', url: 'https://other.test/' }] };
    const tree = [{ id: '0', children: [bar, other] }];
    const findNode = (id, nodes = tree) => {
        for (const node of nodes) {
            if (node.id === id) return node;
            const child = findNode(id, node.children || []);
            if (child) return child;
        }
    };
    const notes = new Map();
    const requests = [];
    const createdBookmarks = [];
    let bookmarkId = 100;
    const chrome = {
        storage: { local: {
            async get(keys) { return keys === null ? { ...settings } : Object.fromEntries(keys.filter(key => key in settings).map(key => [key, settings[key]])); },
            async set(value) { Object.assign(settings, value); }
        } },
        runtime: { onMessage: event(), getManifest: () => ({ version: '2.5' }) },
        tabs: { onCreated: event(), onUpdated: event() },
        tabGroups: {
            TAB_GROUP_ID_NONE: -1,
            async query() { return [{ id: 12, title: 'Work' }]; }
        },
        bookmarks: {
            async getTree() { return structuredClone(tree); },
            async getChildren(id) { return structuredClone(findNode(id).children); },
            async create(options) {
                const parent = findNode(options.parentId);
                assert.ok(parent, 'Parent must exist');
                const node = { id: String(bookmarkId++), title: options.title, ...(options.url ? { url: options.url } : { children: [] }) };
                parent.children.push(node);
                createdBookmarks.push(node);
                return structuredClone(node);
            }
        }
    };
    const context = vm.createContext({
        chrome, crypto: webcrypto, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array,
        atob, btoa, AbortSignal, console, setTimeout() {},
        async fetch(url, options) {
            const parsed = new URL(url);
            requests.push({ url: parsed, ...options });
            const respond = value => ({ ok: true, json: async () => value });
            if (options.method === 'POST') {
                const note = JSON.parse(options.body);
                notes.set(note.path, note);
                return respond({ code: 1, data: note });
            }
            if (parsed.pathname.endsWith('/notes')) {
                const list = [...notes.values()];
                return respond({ code: 1, data: { list, pager: { totalRows: list.length } } });
            }
            const note = notes.get(parsed.searchParams.get('path'));
            return respond(note ? { code: 1, data: note } : { code: missingNoteCode, message: 'Note does not exist' });
        }
    });
    context.importScripts = name => vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
    return { context, settings, notes, requests, createdBookmarks, bar, other };
}

test('收藏栏加密上传包含子文件夹、空文件夹、重复收藏，排除其他收藏及不支持的节点', async () => {
    const env = setup();
    const result = await env.context.uploadFnsBookmarks();
    assert.equal(result.folderCount, 3);
    assert.equal(result.bookmarkCount, 4);
    assert.equal(result.skippedCount, 2);
    const note = env.notes.get(snapshotPath);
    assert.equal(note.vault, 'One Vault');
    for (const text of ['example.test', 'test-token', 'Edge A', 'Work']) assert.ok(!note.content.includes(text));
    const snapshot = await env.context.readFnsPayload(await env.context.getFnsConfig(), snapshotPath);
    assert.equal(snapshot.kind, 'bookmarks-bar');
    assert.equal(snapshot.children[0].children[1].children[0].title, 'Second');
    assert.ok(!JSON.stringify(snapshot).includes('other.test'));
    const devices = await env.context.listFnsBookmarkDevices();
    assert.equal(devices.length, 1);
    assert.equal(devices[0].bookmarkCount, 4);
    for (const request of env.requests) {
        assert.ok(request.url.pathname.startsWith('/api/'));
        assert.ok(!request.url.pathname.includes('/api/api/'));
        assert.equal(request.url.searchParams.has('token'), false);
        assert.equal(request.headers.Authorization, 'Bearer test-token');
        assert.equal(request.redirect, 'error');
    }
});

test('拉取按层级合并，保留本地收藏及顺序，重复执行不重复添加', async () => {
    const env = setup();
    await env.context.uploadFnsBookmarks();
    env.bar.children = [{ id: '30', title: 'Local', url: 'https://local.test/' },
        { id: '31', title: 'Work', children: [{ id: '32', title: 'Local Work', url: 'https://local-work.test/' }] }];
    const otherBefore = JSON.stringify(env.other);
    const first = await env.context.mergeFnsBookmarks(snapshotPath);
    assert.equal(first.bookmarksCreated, 4);
    assert.equal(first.foldersCreated, 2);
    assert.equal(first.foldersReused, 1);
    assert.equal(env.bar.children[0].title, 'Local');
    assert.equal(env.bar.children[1].children[0].title, 'Local Work');
    assert.equal(env.bar.children.filter(node => node.url === 'https://example.test/').length, 2);
    const second = await env.context.mergeFnsBookmarks(snapshotPath);
    assert.equal(second.bookmarksCreated, 0);
    assert.equal(second.foldersCreated, 0);
    assert.equal(second.bookmarksReused, 4);
    assert.equal(JSON.stringify(env.other), otherBefore);
});

test('同名文件夹分别合并，不把不同层级或不同标题的收藏误去重', async () => {
    const env = setup();
    env.bar.children = [{ id: '40', title: 'Same', children: [{ id: '41', title: 'A', url: 'https://same.test/' }] },
        { id: '42', title: 'Same', children: [{ id: '43', title: 'B', url: 'https://same.test/' }] }];
    await env.context.uploadFnsBookmarks();
    env.bar.children = [];
    await env.context.mergeFnsBookmarks(snapshotPath);
    assert.equal(env.bar.children.length, 2);
    assert.equal(env.bar.children[0].children[0].title, 'A');
    assert.equal(env.bar.children[1].children[0].title, 'B');
    assert.equal((await env.context.mergeFnsBookmarks(snapshotPath)).bookmarksCreated, 0);
});

test('同一 Vault 中配置与各设备收藏栏共存，旧标签页快照不参与收藏栏列表', async () => {
    const env = setup();
    await env.context.uploadFnsBookmarks();
    env.settings.syncDeviceId = 'device-b';
    await env.context.uploadFnsBookmarks();
    await env.context.uploadFnsConfig();
    env.notes.set('TabGroup Auto/devices/old-tabs.md', { path: 'TabGroup Auto/devices/old-tabs.md', content: 'old format' });
    env.settings.urlRules = [];
    await env.context.pullFnsConfig();
    assert.equal(env.settings.urlRules[0].groupTitle, 'Work');
    assert.equal(env.settings.urlRules[0].groupId, null);
    assert.equal(env.settings.syncDeviceId, 'device-b');
    assert.equal(env.settings.syncFnsToken, 'test-token');
    assert.equal(env.settings.groupSortSettings.Work.autoSort, true);
    assert.equal((await env.context.listFnsBookmarkDevices()).length, 2);
});

test('错误口令、旧标签页路径、无效树均在写入收藏栏前拒绝', async () => {
    const env = setup();
    await env.context.uploadFnsBookmarks();
    env.settings.syncPassphrase = 'wrong';
    await assert.rejects(env.context.mergeFnsBookmarks(snapshotPath));
    assert.ok((await env.context.listFnsBookmarkDevices())[0].error);
    await assert.rejects(env.context.mergeFnsBookmarks('TabGroup Auto/devices/device-a.md'), /有效/);
    env.settings.syncPassphrase = 'test-password-123456';
    const config = await env.context.getFnsConfig();
    await env.context.writeFnsPayload(config, snapshotPath, { v: 1, kind: 'bookmarks-bar', children: [
        { title: 'valid', url: 'https://valid.test/' }, { title: 'invalid', children: null }
    ] });
    await assert.rejects(env.context.mergeFnsBookmarks(snapshotPath), /格式/);
    assert.equal(env.createdBookmarks.length, 0);
});

test('收藏栏根按 folderType 或旧版 ID 识别，不依赖语言，拒绝受管根', async () => {
    const env = setup();
    env.bar.id = '50';
    env.bar.folderType = 'bookmarks-bar';
    assert.equal((await env.context.getBookmarksBar()).id, '50');
    env.bar.unmodifiable = 'managed';
    await assert.rejects(env.context.uploadFnsBookmarks(), /未找到可写/);
});

test('FNS 430 首次上传创建笔记，拉取缺失配置有明确提示', async () => {
    const env = setup(430);
    await assert.rejects(env.context.pullFnsConfig(), /请先在来源浏览器上传/);
    await env.context.uploadFnsBookmarks();
    await env.context.uploadFnsConfig();
    await env.context.uploadFnsBookmarks();
    assert.equal(env.notes.size, 2);
    assert.equal((await env.context.listFnsBookmarkDevices())[0].bookmarkCount, 4);
});

test('拒绝 HTTP、认证错误和不匹配消息的 430，预读失败不写云端', async () => {
    const env = setup();
    env.settings.syncFnsBaseUrl = 'http://notes.example.test';
    await assert.rejects(env.context.getFnsConfig(), /HTTPS/);
    env.settings.syncFnsBaseUrl = 'https://notes.example.test';
    for (const result of [{ code: 508, message: 'expired' }, { code: 430, message: 'Permission denied' }]) {
        const methods = [];
        env.context.fetch = async (url, options) => { methods.push(options.method); return { ok: true, json: async () => result }; };
        await assert.rejects(env.context.uploadFnsBookmarks(), new RegExp(String(result.code)));
        assert.deepEqual(methods, ['GET']);
    }
});

test('部分合并失败可重试，已创建的收藏不重复添加，并发合并被拒绝', async () => {
    const env = setup();
    await env.context.uploadFnsBookmarks();
    env.bar.children = [];
    const create = env.context.chrome.bookmarks.create;
    let calls = 0;
    env.context.chrome.bookmarks.create = async options => {
        if (++calls === 3) throw new Error('simulated failure');
        return create(options);
    };
    await assert.rejects(env.context.mergeFnsBookmarks(snapshotPath), /已新增 1 个文件夹、1 条收藏/);
    env.context.chrome.bookmarks.create = create;
    const results = await Promise.allSettled([env.context.mergeFnsBookmarks(snapshotPath), env.context.mergeFnsBookmarks(snapshotPath)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.match(results.find(result => result.status === 'rejected').reason.message, /正在合并/);
    assert.equal((await env.context.mergeFnsBookmarks(snapshotPath)).bookmarksCreated, 0);
});

test('旧版设置保留 Cloudflare，新安装默认 FNS', async () => {
    const env = setup();
    delete env.settings.syncBackend;
    assert.equal(await env.context.isFnsSyncSelected(), false);
    delete env.settings.syncPassphrase;
    assert.equal(await env.context.isFnsSyncSelected(), true);
});

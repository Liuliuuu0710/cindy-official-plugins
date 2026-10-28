import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = fs.readFileSync(new URL(".tests/contracts/cindy-mail-runtime.js", root), "utf8");
const copy = (value) => JSON.parse(JSON.stringify(value));

// Behavioral adapter contract, not real-provider integration. Exercise three
// different identity/receipt shapes through the same production flow.
function fixture({
  providerName = "QQ 邮箱",
  draftStorage = "server",
  shape = "imap",
  write,
  autoSend = true,
  acceptCard = true,
} = {}) {
  let kv = {},
    revision = 1,
    timerId = 0,
    clock = 100000,
    flow;
  const cards = [],
    continuations = [],
    writes = [],
    reads = [],
    timers = new Map(),
    locks = new Map();
  let current = {
    status: "read_back",
    draftId: "logical-draft",
    fingerprint: "revision-1",
    locator:
      shape === "imap"
        ? { folder: "草稿箱", uid: 42, uidValidity: "700" }
        : { id: "native-draft" },
    headers: {
      from: "self@example.test",
      to: "David <david@example.test>",
      cc: "",
      bcc: "",
      subject: "Meeting",
    },
    editor: { editable: true, body: "Original", quote: "" },
    attachments: [],
  };
  const account = {
    ok: true,
    accountId: "account-a",
    accountEmail: "self@example.test",
  };
  const context = createContext({
    crypto: webcrypto,
    TextEncoder,
    Date: class extends Date { static now() { return clock; } },
    setTimeout(fn, delay) {
      const id = ++timerId;
      if (delay === 10000 && autoSend) queueMicrotask(fn);
      else timers.set(id, { fn, at: clock + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    navigator: {
      locks: {
        request(name, fn) {
          const next = (locks.get(name) || Promise.resolve()).then(fn);
          locks.set(
            name,
            next.catch(() => {}),
          );
          return next;
        },
      },
    },
    async fetch(url, options = {}) {
      if (url === "/app-context")
        return {
          ok: true,
          json: async () => ({ context: { locale: "zh-CN" } }),
        };
      assert.equal(url, "/kv");
      if (options.method === "PUT") kv = JSON.parse(options.body);
      return { ok: true, json: async () => copy(kv) };
    },
    cindy: {
      onHostMessage() {},
      async send(card) {
        if (card.type === 'mail-draft-read') {
          const stored = cards.findLast(c => c.draft && c.callId === card.callId);
          return stored ? { ok: true, draft: copy(stored.draft) } : { ok: false };
        }
        cards.push(copy(card));
        return { ok: acceptCard || !card.statusOnly?.pendingSend };
      },
      agent: {
        async run(event) {
          continuations.push(copy(event));
          return { ok: true };
        },
      },
    },
  });
  runInContext(source, context);
  const adapter = {
    providerName,
    draftStorage,
    async selectAccount(id) {
      return id === account.accountId
        ? account
        : { ok: false, message: "账号不存在" };
    },
    async readDraft({ record, sourceCallId }) {
      reads.push({ record: copy(record), sourceCallId });
      return { ok: true, data: { readBack: copy(current) } };
    },
    async writeDraft(request) {
      writes.push(copy(request));
      if (write) {
        const result = await write(request, writes.length);
        if (result) return result;
      }
      assert.deepEqual(copy(request.record.locator), current.locator);
      assert.equal(request.record.fingerprint, current.fingerprint);
      if (request.send)
        return {
          ok: true,
          data: {
            sent: true,
            receipt:
              shape === "graph"
                ? { accepted: true, delivery_confirmed: false, status: 202 }
                : {
                    message_id: "<sent@example.test>",
                    accepted: ["david@example.test"],
                    rejected: [],
                  },
          },
        };
      current = {
        ...current,
        fingerprint: "revision-" + ++revision,
        locator:
          shape === "imap"
            ? { ...current.locator, uid: current.locator.uid + 1 }
            : current.locator,
        headers: {
          ...current.headers,
          ...Object.fromEntries(
            ["to", "cc", "bcc", "subject"].map((name) => [
              name,
              request.fields[name],
            ]),
          ),
        },
        editor: {
          ...current.editor,
          body: request.fields.body,
          quote: request.fields.quote,
        },
      };
      return { ok: true, data: { readBack: copy(current) } };
    },
  };
  function restart() {
    timers.clear();
    flow = context.cindyMail.register(adapter);
  }
  restart();
  const values = () => ({
    to: current.headers.to,
    cc: current.headers.cc,
    bcc: current.headers.bcc,
    subject: current.headers.subject,
    body: current.editor.body,
    quote: current.editor.quote,
  });
  const action = (operation) => {
    const card = cards.findLast((card) => card.draft);
    return `mail:${operation}:${card.draft.key}`;
  };
  return {
    cards,
    continuations,
    writes,
    reads,
    values,
    action,
    restart,
    current: () => copy(current),
    kv: () => copy(kv),
    relocate: () => {
      current.locator = { ...current.locator, uid: current.locator.uid + 10 };
    },
    present: () =>
      flow.present({ callId: "card-call" }, account, copy(current)),
    tool: (operation, extra = {}) =>
      flow.beforeTool({
        operation,
        account: account.accountId,
        draftId: current.draftId,
        readOnly: false,
        sourceCallId: "agent-call",
        ...extra,
      }),
    resolve: () => flow.resolveDraft(account.accountId, current.draftId),
    card: (operation, fields = values(), extra = {}) =>
      flow.handleCard({
        actionId: action(operation),
        callId: "card-call",
        userActionToken: "host-click-token",
        formChange: operation === "change",
        formValues: fields,
        ...extra,
      }),
    waitCountdown: async () => {
      for (let i = 0; i < 300 && ![...timers.values()].some(t => t.at === clock + 10000); i++) await Promise.resolve();
      assert.ok([...timers.values()].some(t => t.at === clock + 10000), "countdown armed");
    },
    advance: async (ms) => {
      clock += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); await timer.fn(); }
    },
    flush: async () => {
      for (const [id, timer] of [...timers]) {
        timers.delete(id);
        await timer.fn();
      }
    },
  };
}

for (const [providerName, shape] of [
  ["Gmail", "api"],
  ["QQ 邮箱", "imap"],
  ["163 邮箱", "imap"],
  ["iCloud Mail", "imap"],
  ["Yahoo Mail", "imap"],
  ["Outlook", "graph"],
]) {
  test(
    providerName +
      " adapter: edits, model read, card/model send race and receipt share one draft",
    async () => {
      const f = fixture({ providerName, shape });
      assert.equal(await f.present(), true);
      const fields = {
        ...f.values(),
        body: "Latest edit",
        cc: "copy@example.test",
      };
      await f.card("change", fields);
      assert.equal(f.writes.length, 0);
      const read = await f.tool("get");
      assert.equal(read.data.readBack.editor.body, fields.body);
      assert.equal(read.data.readBack.headers.cc, fields.cc);
      assert.equal(f.writes.length, 1);
      assert.equal((await f.resolve()).draftId, "logical-draft");
      if (shape === "imap") assert.equal((await f.resolve()).locator.uid, 43);
      await Promise.all([f.tool("send"), f.card("send", fields)]);
      assert.equal(f.writes.filter((request) => request.send).length, 1);
      const repeated = await f.tool("send");
      assert.equal(repeated.data.alreadySent, true);
      if (shape === "graph")
        assert.deepEqual(copy(repeated.data.receipt), {
          accepted: true,
          delivery_confirmed: false,
          status: 202,
        });
      else
        assert.deepEqual(copy(repeated.data.receipt.accepted), [
          "david@example.test",
        ]);
      assert.doesNotMatch(JSON.stringify(f.kv()), /Latest edit|copy@example/);
      assert.ok(
        f.cards.some((card) => card.draft?.status.includes("已同步到 " + providerName)),
      );
    },
  );
}

test("an external locator change with identical content is adopted on read", async () => {
  const f = fixture();
  await f.present();
  f.relocate();
  await f.tool("get");
  assert.equal((await f.resolve()).locator.uid, 52);
  assert.equal((await f.tool("send")).ok, true);
  assert.equal(f.writes[0].record.locator.uid, 52);
});

test("card send alone continues with the provider receipt; model send does not start another turn", async () => {
  for (const entry of ["card", "model"]) {
    const f = fixture({ providerName: "Outlook", shape: "graph" });
    await f.present();
    if (entry === "card") await f.card("send");
    else await f.tool("send");
    assert.equal(f.continuations.length, entry === "card" ? 1 : 0);
    if (entry === "card") {
      assert.equal(f.continuations[0].userActionToken, "host-click-token");
      assert.equal(f.continuations[0].event.provider, "Outlook");
      assert.equal(f.continuations[0].event.receipt.delivery_confirmed, false);
    }
  }
});

test("local storage is labeled honestly and still flushes edits before send", async () => {
  const f = fixture({
    providerName: "SMTP",
    draftStorage: "local",
    shape: "local",
  });
  await f.present();
  await f.card("change", { ...f.values(), body: "Local edit" });
  await f.flush();
  assert.ok(f.cards.at(-1).draft.status.includes("已保存到本地草稿"));
  assert.equal(
    f.cards.some((card) => /已同步到|正在同步到/.test(card.draft?.status)),
    false,
  );
  await f.tool("send");
  assert.equal(f.writes.at(-1).fields.body, "Local edit");
});

test("a newer edit during IMAP save is saved to the replacement UID before send", async () => {
  let release, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    write: async (_, number) => {
      if (number === 1) {
        started();
        await wait;
      }
    },
  });
  await f.present();
  await f.card("change", { ...f.values(), body: "First" });
  const saving = f.flush();
  await ready;
  await f.card("change", { ...f.values(), body: "Newest" });
  const sending = f.tool("send");
  release();
  await saving;
  assert.equal((await sending).ok, true);
  assert.deepEqual(
    f.writes.map((request) => request.record.locator.uid),
    [42, 43, 44],
  );
  assert.equal(f.writes.at(-1).fields.body, "Newest");
});

test("unknown/malformed send receipts never retry, including after a plugin restart", async () => {
  for (const write of [
    async () => {
      throw new Error("lost transport");
    },
    async () => ({ ok: true, data: {} }),
  ]) {
    const f = fixture({ write });
    await f.present();
    assert.equal((await f.tool("send")).execution, "unknown");
    f.restart();
    assert.equal((await f.tool("send")).execution, "unknown");
    assert.equal(f.writes.length, 1);
  }
});

test("read-only and wrong-card events cannot flush edits or send; restart automatically reconnects", async () => {
  const f = fixture();
  await f.present();
  await f.card("send", f.values(), { callId: "other-call" });
  assert.equal(f.writes.length, 0);
  await f.card("change", { ...f.values(), body: "Pending edit" });
  assert.equal(
    (await f.tool("get", { readOnly: true })).execution,
    "not_executed",
  );
  assert.equal(
    (await f.tool("send", { readOnly: true })).execution,
    "not_executed",
  );
  assert.equal(f.writes.length, 0);
  await f.flush();
  f.restart();
  assert.equal((await f.tool("send")).ok, true);
  assert.equal(f.reads.length, 1);
});


test('unknown writes allow inspecting the mailbox without unlocking or repeating the write', async () => {
  const f = fixture({ write: async () => { throw new Error('lost response'); } });
  await f.present();
  assert.equal((await f.tool('send')).execution, 'unknown');
  f.restart();
  assert.equal((await f.tool('get')).ok, true);
  assert.equal(f.cards.at(-1).draft.state, 'unconfirmed');
  assert.equal((await f.tool('send')).execution, 'unknown');
  assert.equal(f.writes.length, 1);
});

// Regression: both entry points must expose a real undo interval, not send first.
test("send waits ten seconds; cancel retains draft; send-now and concurrent requests send once", async () => {
  for (const entry of ["card", "model"]) {
    const f = fixture({ autoSend: false });
    await f.present();
    const pending = entry === "card" ? f.card("send") : f.tool("send");
    await f.waitCountdown();
    assert.equal(f.writes.length, 0);
    await f.advance(9999);
    assert.equal(f.writes.length, 0);
    await f.card("cancel", undefined, { formValues: undefined });
    await pending;
    await f.advance(1);
    assert.equal(f.writes.length, 0);
    assert.equal(f.cards.at(-1).draft.state, "draft");
    assert.equal(f.continuations.length, 0);

    const retry = entry === "card" ? f.card("send") : f.tool("send");
    await f.waitCountdown();
    const duplicate = f.tool("send");
    await f.card("now", undefined, { formValues: undefined });
    await Promise.all([retry, duplicate]);
    await f.advance(10000);
    assert.equal(f.writes.filter(w => w.send).length, 1);
    assert.equal(f.continuations.length, entry === "card" ? 1 : 0);
  }
});
test("expiry sends exactly once and restart never resumes a waiting send", async () => {
  const f = fixture({ autoSend: false });
  await f.present();
  const pending = f.tool("send");
  await f.waitCountdown();
  await f.advance(9999);
  assert.equal(f.writes.length, 0);
  await f.advance(1);
  assert.equal((await pending).data.sent, true);
  assert.equal(f.writes.length, 1);

  const restarted = fixture({ autoSend: false });
  await restarted.present();
  void restarted.tool("send");
  await restarted.waitCountdown();
  restarted.restart();
  await restarted.advance(10000);
  assert.equal(restarted.writes.length, 0);
  const fresh = restarted.tool('send');
  await restarted.waitCountdown();
  assert.equal(restarted.writes.length, 0);
  await restarted.card('cancel');
  assert.equal((await fresh).execution, 'not_executed');
});
test("a rejected countdown card or a draft without a presented card cannot send", async () => {
  const f = fixture({ acceptCard: false });
  assert.equal((await f.tool("send")).execution, "not_executed");
  await f.present();
  assert.equal((await f.tool("send")).execution, "not_executed");
  assert.equal(f.writes.length, 0);
});

test("Gmail supplies only an adapter and no card HTML or bundled workflow", () => {
  const main = fs.readFileSync(new URL("google-gmail/main.js", root), "utf8");
  assert.match(main, /cindyMail.register/);
  assert.doesNotMatch(main, /data-ghost-form|card-update|BEGIN SHARED MAIL|handleMailCard/);
});

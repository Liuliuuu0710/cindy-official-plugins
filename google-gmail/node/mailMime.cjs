'use strict';
// Fixed Gmail endpoints, request-local Host OAuth token. This module updates
// drafts only; sending remains owned by cindyMail's confirmation/countdown.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const MAX_BYTES = 25 * 1024 * 1024;
const header = (part, name) => (part.headers || []).filter(h => h.name.toLowerCase() === name).map(h => h.value).join('\n');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const keyFor = part => hash(JSON.stringify([part.partId || '', part.filename || '', part.mimeType, part.body?.size, header(part, 'content-id')]));
// Inline/CID are presentation metadata, not proof of an attached file. Body
// containers (and their text alternatives) still need traversal. Explicit file
// names/attachment disposition stop traversal. Every other MIME type is an
// opaque file, even when Gmail omits its filename/disposition (notably .eml).
function isAttachmentPart(part) {
  const disposition = header(part, 'content-disposition');
  const bodyPart = /^multipart\//i.test(part.mimeType) || /^text\/(plain|html)$/i.test(part.mimeType);
  return Boolean(part.filename || /^attachment\b/i.test(disposition) || !bodyPart);
}
// Inspect URL positions, never visible text, comments or code samples. All
// create/update/retention paths share this extractor; it does not rewrite HTML.
function referencedContentIds(html) {
  const ids = new Set();
  const add = value => {
    const match = /^cid:(.+)$/i.exec(value.trim());
    if (!match) return;
    try { ids.add(decodeURIComponent(match[1])); }
    catch (_) { throw new Error('正文图片引用无效，请检查 CID 地址后再保存。'); }
  };
  const entities = value => value.replace(/&(?:#(x[0-9a-f]+|\d+);?|([a-z]+);)/gi, (all, number, name) => {
    if (!number) return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', commat: '@' })[name] ?? all;
    const point = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd';
  });
  const css = value => {
    // Consume strings/comments as tokens so content:"url(cid:example)" is text.
    for (const m of value.matchAll(/\/\*[\s\S]*?(?:\*\/|$)|\burl\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s)'"\\]+))\s*\)|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/gi)) {
      if (m[1] !== undefined || m[2] !== undefined || m[3] !== undefined) add(m[1] ?? m[2] ?? m[3]);
    }
  };
  // Keep quoted '>' inside a tag, and consume raw-text elements as a whole so
  // example markup in textarea/script cannot create phantom references.
  const tokens = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)(?:<\/\1\s*>|$)|<[a-z][\w:-]*\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  for (const token of html.matchAll(tokens)) {
    if (token[0].startsWith('<!--')) continue;
    if (token[1]?.toLowerCase() === 'style') css(token[3]);
    const opening = token[1] ? token[2] : token[0].replace(/^<[\w:-]+|>$/g, '');
    for (const attr of opening.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const name = attr[1].toLowerCase(), value = entities(attr[2] ?? attr[3] ?? attr[4] ?? '');
      if (name === 'style') css(value);
      else if (name === 'srcset') {
        // URLs end at whitespace, not at every comma (data URLs contain commas).
        let cursor = 0;
        while (cursor < value.length) {
          while (/[\s,]/.test(value[cursor] || '') && cursor < value.length) cursor++;
          const start = cursor;
          while (cursor < value.length && !/\s/.test(value[cursor])) cursor++;
          const url = value.slice(start, cursor);
          add(url.replace(/,+$/, ''));
          if (url.endsWith(',')) continue;
          let depth = 0;
          while (cursor < value.length) {
            const ch = value[cursor++];
            if (ch === '(') depth++;
            else if (ch === ')') depth = Math.max(0, depth - 1);
            else if (ch === ',' && !depth) break;
          }
        }
      } else if (['src', 'href', 'xlink:href', 'background', 'poster', 'data'].includes(name)) add(value);
    }
  }
  return ids;
}
// Return only fixed, safe guidance across worker boundaries; never forward an
// arbitrary decoder/provider exception (which may contain private input).
function draftBodyErrorMessage(error) {
  switch (error?.code) {
    case 'DRAFT_BODY_CHARSET': return '不支持草稿正文的字符编码，请在邮箱中编辑此草稿。';
    case 'DRAFT_BODY_DECODE': return '无法无损解码草稿正文，请在邮箱中编辑此草稿。';
    default: return '';
  }
}
function decodeMimeBody(part) {
  const match = /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]*))/i.exec(header(part, 'content-type'));
  let decoder;
  try { decoder = new TextDecoder(match ? (match[1] ?? match[2] ?? match[3]) : 'utf-8', { fatal: true }); }
  catch (_) { throw Object.assign(new Error(draftBodyErrorMessage({ code: 'DRAFT_BODY_CHARSET' })), { code: 'DRAFT_BODY_CHARSET' }); }
  try { return decoder.decode(Buffer.from(part.body.data, 'base64url')); }
  catch (_) { throw Object.assign(new Error(draftBodyErrorMessage({ code: 'DRAFT_BODY_DECODE' })), { code: 'DRAFT_BODY_DECODE' }); }
}
function imageType(data) {
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(data.subarray(0, 6).toString())) return 'image/gif';
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return '';
}

async function gmailJson(token, resource, init = {}, maxBytes = MAX_BYTES * 2) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + resource, {
    ...init, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    // A received rejection is authoritative even if discarding its body fails.
    // Request timeout/client-close and server errors cannot exclude a write.
    const execution = response.status >= 400 && response.status < 500 && ![408, 499].includes(response.status)
      ? 'not_executed' : 'unknown';
    try { await response.body?.cancel(); } catch (_) { /* Keep the HTTP receipt. */ }
    throw Object.assign(new Error('Gmail HTTP ' + response.status), { execution, status: response.status });
  }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > maxBytes) throw new Error('邮件内容超过大小上限'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    // The successful status survives parse/size/stream failure of its receipt.
    throw Object.assign(error, { execution: 'executed', status: response.status });
  }
}

function collectAttachments(payload) {
  const result = [];
  function walk(part) {
    if (isAttachmentPart(part)) result.push(part);
    else for (const child of part.parts || []) walk(child);
  }
  walk(payload); return result;
}

// Gmail may store a text body behind an attachmentId. Resolve it before
// fingerprinting or editing; an incomplete body must never look like empty text.
async function loadMessageBodies(message, token) {
  let total = 0;
  async function walk(part) {
    if (isAttachmentPart(part)) return;
    const body = part.body || {};
    if (['text/plain', 'text/html'].includes(part.mimeType) && body.attachmentId && !body.data) {
      if (!Number.isSafeInteger(body.size) || body.size < 0 || total + body.size > MAX_BYTES) throw new Error('无法完整读取邮件正文');
      const loaded = await gmailJson(token, 'messages/' + encodeURIComponent(message.id) + '/attachments/' + encodeURIComponent(body.attachmentId));
      if (typeof loaded.data !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(loaded.data)
        || loaded.size !== body.size || Buffer.from(loaded.data, 'base64url').length !== body.size) throw new Error('邮件正文大小不一致');
      total += body.size;
      body.data = loaded.data;
    }
    for (const child of part.parts || []) await walk(child);
  }
  if (message?.payload) await walk(message.payload);
}

function buildMime({ fields, headers, files }, helpers) {
  const { addressHeader, encodeWords, encodeHeader, wrap } = helpers;
  const boundary = 'cindy-' + crypto.randomUUID();
  const lines = [];
  for (const [name, value] of Object.entries({ From: headers.from, To: fields.to, Cc: fields.cc, Bcc: fields.bcc, 'Reply-To': headers['reply-to'] })) {
    if (value) lines.push(name + ': ' + addressHeader(value));
  }
  lines.push('Subject: ' + encodeWords(fields.subject));
  for (const name of ['in-reply-to', 'references']) if (headers[name]) lines.push(name + ': ' + encodeHeader(headers[name]));
  lines.push('MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="' + boundary + '"', '', '--' + boundary,
    'Content-Type: multipart/related; boundary="rel-' + boundary + '"', '', '--rel-' + boundary,
    'Content-Type: multipart/alternative; boundary="alt-' + boundary + '"', '', '--alt-' + boundary,
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(fields.body + fields.quote), '', '--alt-' + boundary,
    'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(fields.bodyHtml + fields.quoteHtml), '', '--alt-' + boundary + '--');
  const addFile = (file, delimiter) => {
    const filename = encodeURIComponent(file.filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16));
    const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType) ? file.mimeType : 'application/octet-stream';
    lines.push('', delimiter, 'Content-Type: ' + contentType, 'Content-Transfer-Encoding: base64',
      'Content-Disposition: ' + (file.contentId ? 'inline' : 'attachment') + "; filename*=UTF-8''" + filename);
    if (file.contentId) lines.push('Content-ID: <' + encodeHeader(file.contentId.replace(/^<|>$/g, '')) + '>');
    lines.push('', wrap(file.data));
  };
  for (const file of files.filter(f => f.contentId)) addFile(file, '--rel-' + boundary);
  lines.push('', '--rel-' + boundary + '--');
  for (const file of files.filter(f => !f.contentId)) addFile(file, '--' + boundary);
  lines.push('', '--' + boundary + '--', '');
  return lines.join('\r\n');
}

async function updateRichDraft(p, token, before, helpers, execution) {
  const fields = p.fields;
  const wanted = JSON.parse(fields.attachmentItems);
  if (!Array.isArray(wanted) || wanted.length > 100 || wanted.some(a => !a || typeof a.key !== 'string') || new Set(wanted.map(a => a.key)).size !== wanted.length) throw new Error('附件清单无效，请重新读取草稿');
  const current = await gmailJson(token, 'drafts/' + encodeURIComponent(p.draftId) + '?format=full');
  await loadMessageBodies(current.message, token);
  const verified = helpers.draftReadBack({ draft: current }, p.draftId);
  if (verified.fingerprint !== before.fingerprint) return { ok: false, execution: 'not_executed', stale: verified, message: '草稿已在其他地方修改，请重新核对后再发送。' };
  const parts = collectAttachments(current.message.payload);
  const files = []; let total = 0;
  for (const item of wanted) {
    const part = parts.find(part => keyFor(part) === item.key);
    if (!part) throw new Error('附件已发生变化，请重新读取草稿');
    let encoded = part.body?.data;
    if (encoded === undefined && part.body?.attachmentId) {
      const result = await gmailJson(token, 'messages/' + encodeURIComponent(current.message.id) + '/attachments/' + encodeURIComponent(part.body.attachmentId));
      encoded = result.data;
    }
    if (typeof encoded !== 'string') throw new Error('无法完整读取附件，草稿未修改');
    const data = Buffer.from(encoded, 'base64url'); total += data.length;
    if (total > MAX_BYTES || data.length !== part.body.size) throw new Error('附件大小不一致或超过 25 MiB，草稿未修改');
    const originalCid = header(part, 'content-id').replace(/^<|>$/g, '');
    const contentId = item.contentId === undefined ? originalCid : item.contentId;
    if (typeof contentId !== 'string') throw new Error('图片引用无效');
    const cid = contentId.replace(/^<|>$/g, '');
    if (cid !== originalCid && (originalCid || !/^image-[1-9]\d*@cindy\.local$/.test(cid) || !imageType(data))) throw new Error('只能将图片附件插入正文');
    const filename = item.filename ?? part.filename ?? '';
    if (typeof filename !== 'string' || filename.length > 1024 || /[\r\n\0]/.test(filename)) throw new Error('附件名称无效');
    files.push({ filename, mimeType: cid !== originalCid ? imageType(data) : part.mimeType, contentId: cid, data });
  }
  if (!Array.isArray(p.attachments || []) || (p.attachments || []).length > 20) throw new Error('附件清单无效');
  for (const item of p.attachments || []) {
    if (!item || typeof item.path !== 'string' || typeof item.filename !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > 16 * 1024 * 1024) throw new Error('附件无效，请重新选择');
    const file = await fs.promises.open(item.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let data;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== item.bytes) throw new Error('附件已变化，请重新选择');
      data = await file.readFile();
    } finally { await file.close(); }
    if (hash(data) !== item.sha256) throw new Error('附件已变化，请重新选择');
    total += data.length;
    if (total > MAX_BYTES) throw new Error('附件总大小不能超过 25 MiB');
    const mimeType = imageType(data) || 'application/octet-stream';
    if (item.contentId && (!/^image\//.test(mimeType) || !/^[a-f0-9-]+@cindy\.local$/.test(item.contentId))) throw new Error('请选择 PNG、JPEG、GIF 或 WebP 图片');
    files.push({ filename: item.filename, mimeType, contentId: item.contentId || '', data });
  }
  // Removing an inline attachment must not leave a broken image reference.
  const cids = new Set(files.filter(f => f.contentId).map(f => f.contentId.replace(/^<|>$/g, '')));
  if (cids.size !== files.filter(f => f.contentId).length) throw new Error('图片引用重复，请重新读取草稿');
  for (const cid of referencedContentIds(fields.bodyHtml + fields.quoteHtml)) if (!cids.has(cid)) throw new Error('正文仍引用已移除的图片，请先在正文中删除图片');
  const raw = buildMime({ fields, headers: before.headers, files }, helpers);
  // The transport preserves a received write status; without one, do not replay.
  execution.started = true;
  await gmailJson(token, 'drafts/' + encodeURIComponent(p.draftId), { method: 'PUT', body: JSON.stringify({ id: p.draftId, message: { raw: Buffer.from(raw).toString('base64url'), ...(before.threadId ? { threadId: before.threadId } : {}) } }) }, 300 * 1024);
  return { ok: true, files: files.map(f => ({ filename: f.filename, mimeType: f.mimeType, bytes: f.data.length,
    contentId: f.contentId.replace(/^<|>$/g, ''), sha256: hash(f.data) })) };
}
async function verifyDraftAttachmentBytes(token, saved, expected) {
  const actual = [];
  let total = 0;
  for (const file of saved.attachments) {
    let sha256 = file.sha256;
    if (!sha256) {
      if (!file.attachmentId) throw new Error('附件内容无法核对');
      const part = await gmailJson(token, 'messages/' + encodeURIComponent(saved.messageId) + '/attachments/' + encodeURIComponent(file.attachmentId));
      if (typeof part.data !== 'string') throw new Error('附件内容无法核对');
      const data = Buffer.from(part.data, 'base64url');
      if (data.length !== file.bytes) throw new Error('附件大小不一致');
      sha256 = hash(data);
    }
    total += file.bytes;
    if (total > MAX_BYTES) throw new Error('附件内容超过大小上限');
    actual.push({ ...file, sha256 });
  }
  const facts = files => JSON.stringify(files.map(f => [f.filename, f.mimeType, f.bytes, (f.contentId || '').replace(/^<|>$/g, ''), f.sha256]).sort());
  return facts(actual) === facts(expected);
}
module.exports = { updateRichDraft, buildMime, keyFor, isAttachmentPart, referencedContentIds, gmailJson, decodeMimeBody, draftBodyErrorMessage, loadMessageBodies, verifyDraftAttachmentBytes };

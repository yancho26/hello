/* Обслужване на статичните файлове на интерфейса.
 *
 * Два източника с еднакво поведение:
 *  - diskStatic   — чете от папка на диска (при `node server.js`), така че
 *                   промените по интерфейса се виждат веднага;
 *  - memoryStatic — файловете са вградени в самия изпълним файл (.exe) и
 *                   се държат в паметта.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const mimeFor = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/** Превръща пътя от адреса в относителен път без излизане нагоре. */
export function safeRelative(pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  if (rel.includes('\0')) return null;
  const parts = [];
  for (const part of rel.split(/[/\\]+/)) {
    if (!part || part === '.') continue;
    if (part === '..') return null;
    parts.push(part);
  }
  return parts.length ? parts.join('/') : null;
}

const notFound = (res) =>
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Страницата не е намерена');

/** Файлове от папка на диска. */
export function diskStatic(dir) {
  const root = path.resolve(dir);
  return (req, res, pathname) => {
    const rel = safeRelative(pathname);
    if (!rel) {
      res.writeHead(403).end('Забранено');
      return;
    }
    const target = path.join(root, rel);
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403).end('Забранено');
      return;
    }
    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) {
        notFound(res);
        return;
      }
      const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': mimeFor(target),
        'Content-Length': stat.size,
        'ETag': etag,
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(target).pipe(res);
    });
  };
}

/** Файлове, вградени в изпълнимия файл: { 'index.html': Buffer, … }. */
export function memoryStatic(files) {
  const table = new Map();
  for (const [rel, body] of Object.entries(files)) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const hash = crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 16);
    table.set(rel, { body: buf, etag: `"${hash}"`, type: mimeFor(rel) });
  }
  return (req, res, pathname) => {
    const rel = safeRelative(pathname);
    if (!rel) {
      res.writeHead(403).end('Забранено');
      return;
    }
    const file = table.get(rel);
    if (!file) {
      notFound(res);
      return;
    }
    if (req.headers['if-none-match'] === file.etag) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': file.type,
      'Content-Length': file.body.length,
      'ETag': file.etag,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : file.body);
  };
}

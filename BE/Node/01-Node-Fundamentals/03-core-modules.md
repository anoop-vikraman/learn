# 03 · Core modules

Built-in modules ship with Node; import them with the `node:` prefix.

## 1. `fs`: the file system

> **In short:** Read, write, list and watch files; use the promise API (`node:fs/promises`) in servers, never the `*Sync` versions inside request handlers.

```js
import { readFile, writeFile, appendFile, mkdir, readdir, stat, rm, rename } from 'node:fs/promises';

const text = await readFile('data.json', 'utf8');
const data = JSON.parse(text);
await writeFile('out.json', JSON.stringify(data, null, 2));
await appendFile('app.log', 'line\n');
await mkdir('uploads/2026', { recursive: true });
const files = await readdir('uploads', { withFileTypes: true });
const info = await stat('data.json');      // size, mtime, isFile()
await rename('a.txt', 'b.txt');
await rm('tmp', { recursive: true, force: true });
```

`readFileSync` is fine in startup code (loading config once), not per request.

## 2. `path`: building file paths

> **In short:** Join and resolve paths in an OS-independent way instead of concatenating strings.

```js
import path from 'node:path';

path.join('uploads', 'img', 'a.png');            // 'uploads/img/a.png' (or backslashes on Windows)
path.resolve('src', 'app.js');                   // absolute path
path.extname('photo.jpg');                       // '.jpg'
path.basename('/a/b/photo.jpg', '.jpg');         // 'photo'
path.dirname('/a/b/photo.jpg');                  // '/a/b'
const here = import.meta.dirname;                // folder of the current ES module
```

⚠️ When building paths from user input, check the result stays inside the intended folder (path traversal: `../../etc/passwd`).

## 3. `process`: the running program

> **In short:** Access environment variables, arguments, the working directory, memory usage and exit codes, and listen for signals.

```js
process.env.NODE_ENV;
process.argv;                 // ['node', '/path/app.js', ...args]
process.cwd();
process.pid;
process.memoryUsage();        // rss, heapUsed…
process.uptime();
process.exitCode = 1;         // exit code when the process ends naturally
process.on('SIGTERM', () => shutdown());   // sent by Docker/Kubernetes when stopping
```

## 4. `os`: the machine

> **In short:** Information about the host: CPU count, memory, platform, hostname.

```js
import os from 'node:os';
os.availableParallelism();    // usable CPU cores
os.totalmem(); os.freemem(); os.platform(); os.hostname();
```

## 5. `http`: a server without any framework

> **In short:** Node's built-in `http` module is what every framework (Express, Fastify) is built on; writing a tiny server by hand shows what they do for you.

```js
import http from 'node:http';

const tasks = [{ id: 1, title: 'Learn Node', done: false }];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/tasks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(tasks));
  }

  if (req.method === 'POST' && url.pathname === '/tasks') {
    let body = '';
    for await (const chunk of req) body += chunk;     // read the body stream
    try {
      const { title } = JSON.parse(body);
      const task = { id: tasks.length + 1, title, done: false };
      tasks.push(task);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(task));
    } catch {
      res.writeHead(400);
      return res.end('Invalid JSON');
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, () => console.log('http://localhost:3000'));
```

Everything is manual: routing, body parsing, JSON, status codes, errors. Frameworks automate exactly this (next folder).

## 6. `url` and `URLSearchParams`

> **In short:** Parse and build URLs and query strings safely.

```js
const u = new URL('https://example.com/tasks?page=2&done=false');
u.pathname;                       // '/tasks'
u.searchParams.get('page');       // '2'
u.searchParams.set('page', '3');
u.toString();
```

## 7. `crypto`: hashing, random values, encryption

> **In short:** Secure random IDs and tokens, hashes, HMAC signatures and encryption, all built in.

```js
import { randomUUID, randomBytes, createHash, createHmac, timingSafeEqual, scrypt } from 'node:crypto';

randomUUID();                                         // 'c1b2…' for IDs
randomBytes(32).toString('hex');                      // secure token
createHash('sha256').update('data').digest('hex');    // checksum (NOT for passwords)
createHmac('sha256', secret).update(payload).digest('hex');   // verify webhooks

// Compare secrets in constant time (prevents timing attacks)
timingSafeEqual(Buffer.from(a), Buffer.from(b));
```

For passwords use a slow hash: `scrypt` (built in) or the `argon2`/`bcrypt` packages (lesson 03 of Express).

## 8. `child_process`: running other programs

> **In short:** Run shell commands or other scripts in separate processes.

```js
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const { stdout } = await promisify(execFile)('git', ['rev-parse', 'HEAD']);   // no shell: safer
const child = spawn('ffmpeg', ['-i', 'in.mp4', 'out.webm']);                  // streaming output
child.on('exit', (code) => console.log('exit', code));
```

⚠️ Never pass user input to `exec` (it runs a shell: command injection). Prefer `execFile`/`spawn` with an arguments array.

## 9. `worker_threads`: CPU work off the main thread

> **In short:** Run CPU-heavy JavaScript in another thread so the event loop stays responsive.

```js
// hash-worker.js
import { parentPort, workerData } from 'node:worker_threads';
import { pbkdf2Sync } from 'node:crypto';
parentPort.postMessage(pbkdf2Sync(workerData.password, 'salt', 600_000, 64, 'sha512').toString('hex'));

// main.js
import { Worker } from 'node:worker_threads';

function hashInWorker(password) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./hash-worker.js', import.meta.url), { workerData: { password } });
    worker.once('message', resolve);
    worker.once('error', reject);
  });
}
```

Creating a worker per task is expensive; use a pool (the `piscina` library) for repeated work.

## 10. Other useful modules

> **In short:** A quick map of more built-ins you'll meet.

| Module | Use |
| --- | --- |
| `node:util` | `promisify`, `inspect`, `parseArgs` (CLI arguments), `styleText` |
| `node:zlib` | gzip/brotli compression |
| `node:perf_hooks` | Timing, event loop delay monitoring |
| `node:async_hooks` → `AsyncLocalStorage` | Request-scoped context (request IDs in logs) |
| `node:test` + `node:assert` | Built-in test runner |
| `node:dns`, `node:net`, `node:tls` | Low-level networking |
| `node:readline` | Read input line by line |
| `node:cluster` | Multiple server processes on one port |
| `node:sqlite` | Built-in SQLite (newer versions) |

```js
// Request-scoped context: every log line in a request can include its request ID
import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage();
// in middleware: requestContext.run({ requestId }, () => next());
// anywhere later: requestContext.getStore()?.requestId
```

---

## 11. Exercises

1. Write a script that lists all `.js` files in a folder recursively with their sizes.
2. Build the raw `http` task server, then add `DELETE /tasks/:id` by parsing the URL yourself.
3. Generate a secure API token and verify an HMAC signature with `timingSafeEqual`.
4. Run `git log -1` via `execFile` and print the output.
5. Move a CPU-heavy function to a worker thread and confirm the server still responds during it.

# 02 · Async patterns, events and streams

## 1. Callbacks (the original Node style)

> **In short:** Older Node APIs take a callback as the last argument, called with `(error, result)`: the "error-first" convention.

```js
import fs from 'node:fs';

fs.readFile('notes.txt', 'utf8', (err, data) => {
  if (err) {
    console.error('Failed:', err.message);
    return;
  }
  console.log(data);
});
```

Nesting many callbacks leads to "callback hell". Modern code uses promises.

## 2. Promises and async/await

> **In short:** Almost every Node API has a promise version; use `async`/`await` with `try`/`catch` for readable async code.

```js
import { readFile, writeFile } from 'node:fs/promises';

async function copyUpper(src, dest) {
  try {
    const text = await readFile(src, 'utf8');
    await writeFile(dest, text.toUpperCase());
  } catch (err) {
    console.error('Copy failed:', err);
    throw err;                       // let the caller decide
  }
}

// Convert a callback API into a promise API
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
const execAsync = promisify(exec);
const { stdout } = await execAsync('ls');
```

Top-level `await` works in ES modules. Run independent work in parallel with `Promise.all` (see the JavaScript async lesson in [../../../FE/01-JavaScript/basics/07-async-promises-fetch.md](../../../FE/01-JavaScript/basics/07-async-promises-fetch.md)).

## 3. Error handling in async code

> **In short:** Handle every rejected promise; an unhandled rejection crashes modern Node processes.

```js
// ❌ floating promise: errors are unhandled
saveUser(user);

// ✅
await saveUser(user);
saveUser(user).catch((err) => logger.error(err));

// Last-resort handlers: log and exit (a process manager restarts you)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err);
  process.exit(1);
});
```

- Since Node 15, an unhandled rejection **terminates the process** by default. That's good: it surfaces bugs.
- After an `uncaughtException`, the process may be in an unknown state: log it and exit, never "continue as if nothing happened".
- Use `Error` objects (not strings) and add context with `cause`: `throw new Error('Saving user failed', { cause: err })`.

## 4. Timers and scheduling

> **In short:** `setTimeout`/`setInterval` schedule callbacks; `setImmediate` runs after I/O; promise-based timers live in `node:timers/promises`.

```js
import { setTimeout as sleep } from 'node:timers/promises';

await sleep(1000);                         // pause 1 s without blocking

const interval = setInterval(() => console.log('tick'), 1000);
clearInterval(interval);

const t = setTimeout(cleanup, 60_000);
t.unref();                                 // don't keep the process alive just for this timer
```

## 5. EventEmitter

> **In short:** Many Node objects (servers, streams, processes) emit named events; you can create your own emitters for in-process pub/sub.

```js
import { EventEmitter } from 'node:events';

class OrderService extends EventEmitter {
  async create(order) {
    const saved = await db.save(order);
    this.emit('created', saved);           // notify listeners
    return saved;
  }
}

const orders = new OrderService();
orders.on('created', (order) => console.log('send email for', order.id));
orders.once('created', () => console.log('first order ever!'));

// Always handle 'error' events: an emitted 'error' with no listener crashes the process
orders.on('error', (err) => console.error(err));

// Await a single event
import { once } from 'node:events';
const [order] = await once(orders, 'created');
```

- Listeners run **synchronously** in order when `emit` is called.
- Too many listeners triggers a "possible memory leak" warning; remove listeners you no longer need (`off`).
- EventEmitter is in-process only. For events across processes or servers, use Redis pub/sub or a queue.

## 6. Buffers: binary data

> **In short:** A `Buffer` is a fixed-size chunk of raw bytes, used for files, network data, images and encodings.

```js
const buf = Buffer.from('héllo', 'utf8');
buf.length;                    // 6 bytes (é takes 2)
buf.toString('base64');        // 'aMOpbGxv'
Buffer.from('aMOpbGxv', 'base64').toString('utf8');   // 'héllo'
buf.toString('hex');
Buffer.concat([buf, Buffer.from('!')]);
```

## 7. Streams

> **In short:** Streams process data piece by piece instead of loading it all into memory; they're how Node handles big files, uploads and HTTP bodies efficiently.

| Type | Example |
| --- | --- |
| **Readable** | `fs.createReadStream`, HTTP request (`req`), `process.stdin` |
| **Writable** | `fs.createWriteStream`, HTTP response (`res`), `process.stdout` |
| **Duplex** | TCP socket |
| **Transform** | `zlib.createGzip()`, a CSV parser |

```js
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

// Compress a 5 GB file using only a few MB of memory
await pipeline(
  createReadStream('huge.log'),
  createGzip(),
  createWriteStream('huge.log.gz'),
);
```

- Always use **`pipeline`** (not `.pipe()`): it forwards errors and closes every stream on failure.
- **Backpressure**: when the writable side is slower, the readable side pauses automatically, so memory doesn't explode. `pipeline` handles this for you.

### Reading streams with async iteration

> **In short:** `for await` reads a stream (e.g. line by line) without loading it all into memory.

```js
import { createInterface } from 'node:readline';

const rl = createInterface({ input: createReadStream('users.csv') });
for await (const line of rl) {
  // process one line at a time
}
```

### A custom Transform

> **In short:** Write your own stream step that changes each chunk as it passes through.

```js
import { Transform } from 'node:stream';

const upper = new Transform({
  transform(chunk, _encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  },
});

await pipeline(process.stdin, upper, process.stdout);
```

### Streaming an HTTP response

> **In short:** Pipe data to `res` so the client receives rows as they're produced.

```js
app.get('/export', async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  await pipeline(db.streamTasksAsCsv(), res);     // rows go to the client as they're read
});
```

## 8. AbortController: cancelling async work

> **In short:** Pass an `AbortSignal` to cancel fetches, timers and many Node APIs, e.g. when a client disconnects or a timeout passes.

```js
const res = await fetch('https://api.example.com/slow', { signal: AbortSignal.timeout(5000) });

const controller = new AbortController();
req.on('close', () => controller.abort());        // client went away
await doWork({ signal: controller.signal });
```

---

## 9. Exercises

1. Convert a callback-based `fs.readFile` example to async/await with error handling.
2. Build an `OrderService` EventEmitter that emits `created`, and attach two listeners.
3. Gzip a large file with `pipeline` and compare memory use with `readFile` + `gzipSync`.
4. Count lines in a big CSV with `readline` and `for await`.
5. Add global `unhandledRejection`/`uncaughtException` handlers and trigger each one.

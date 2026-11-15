# 00 · How Python works internally

A short look under the hood. You don't need this to start coding, but it explains many behaviours you'll meet later (mutability, performance, the GIL, why async exists).

## 1. Interpreter, not compiler (mostly)

> **In short:** CPython compiles your source to bytecode, then a virtual machine executes that bytecode instruction by instruction.

```
hello.py ──(parse)──▶ AST ──(compile)──▶ bytecode (.pyc in __pycache__) ──▶ CPython VM executes it
```

- **CPython** is the standard implementation, written in C. (Others: PyPy with a JIT, Jython, MicroPython.)
- Bytecode is cached in `__pycache__/*.pyc` so imports are faster next time.
- You can see bytecode with the `dis` module:

```python
import dis

def add(a, b):
    return a + b

dis.dis(add)
#  LOAD_FAST a
#  LOAD_FAST b
#  BINARY_OP + 
#  RETURN_VALUE
```

- Python 3.11+ added a **specializing adaptive interpreter** (much faster on hot code), and 3.13 has an experimental JIT.

## 2. Everything is an object

> **In short:** Every value (number, string, function, class, module) is a C struct on the heap with a type, a reference count and its data.

```python
x = 42
type(x)        # <class 'int'>
id(x)          # memory address (identity)
type(len)      # <class 'builtin_function_or_method'>
type(int)      # <class 'type'>: classes are objects too
```

Each object knows its **type**, which defines what operations it supports (`x + y` calls `type(x).__add__`).

## 3. Names are references

> **In short:** Variables are labels pointing at objects; assignment never copies, it just adds another label.

```python
a = [1, 2]
b = a          # b points to the SAME list
b.append(3)
a              # [1, 2, 3]
a is b         # True
```

This explains mutable-default-argument bugs, shared nested lists, and why functions can change a list you pass in.

## 4. Memory management

> **In short:** CPython frees most objects instantly via reference counting, plus a cycle collector for objects that reference each other.

- Each object has a **reference count**. When it reaches zero, the memory is freed immediately.
- Objects that reference each other in a cycle never reach zero, so a **garbage collector** runs periodically to find and free such cycles (`gc` module).
- Small integers (-5 to 256) and some strings are cached and reused, which is why `a is b` can be True for small numbers. Never rely on that; use `==` for values.

## 5. How attribute lookup works

> **In short:** `obj.attr` checks the instance's `__dict__`, then the class and its parents in MRO order; descriptors like `property` hook into this.

```python
class Dog:
    sound = "woof"                # class attribute
    def __init__(self):
        self.name = "Rex"         # instance attribute (stored in self.__dict__)

d = Dog()
d.__dict__                        # {'name': 'Rex'}
d.sound                           # not on the instance → found on the class
Dog.__mro__                       # lookup order through inheritance
```

`@property`, methods and ORM columns are **descriptors**: objects on the class that control what happens when the attribute is read or set.

## 6. Function calls and frames

> **In short:** Each call creates a frame holding local variables; closures keep references to outer variables in "cells".

- A **frame** stores the function's locals, the current instruction and a link to the caller. Tracebacks are a printout of the frame stack.
- Local variable access is fast (array slots); global/built-in lookups are slower (dict lookups).
- Recursion depth is limited (`sys.getrecursionlimit()`, ~1000) to protect the C stack.

## 7. Imports

> **In short:** `import x` finds the module on `sys.path`, executes it once, and caches it in `sys.modules`.

```python
import sys
sys.path         # where Python looks for modules (script folder, site-packages…)
sys.modules      # already-imported modules
```

Module-level code runs at import time, which is why heavy work at module level slows startup and why circular imports cause half-initialized modules.

## 8. The GIL

> **In short:** CPython's Global Interpreter Lock lets only one thread run Python bytecode at a time, so threads help with waiting (I/O) but not with CPU-heavy work.

- The GIL makes reference counting thread-safe without locking every object.
- It's **released** during blocking I/O (network, disk, `time.sleep`) and by many C extensions (NumPy), so threads still speed up I/O-bound programs.
- For CPU-bound parallelism, use **multiple processes** (each has its own interpreter and GIL).
- Python 3.13+ offers an experimental **free-threaded** build without the GIL.

## 9. Async and the event loop

> **In short:** `asyncio` runs many coroutines on one thread by switching between them whenever one is waiting for I/O.

- An `async def` function returns a **coroutine** object; nothing runs until it's awaited or scheduled as a task.
- The **event loop** keeps a queue of ready tasks. When a task hits `await` on I/O, it pauses and the loop runs another task. When the OS reports the I/O is done (via `epoll`/`kqueue`), the paused task is resumed.
- This is how FastAPI serves thousands of concurrent connections in one process, and why a blocking call inside `async def` freezes everything: the loop never gets control back.

## 10. Why Python can be slow, and what to do

> **In short:** Dynamic typing and the interpreter add overhead per operation; use built-ins, better algorithms, C-backed libraries or more processes.

| Cause | Mitigation |
| --- | --- |
| Every operation checks types at runtime | Use built-ins and comprehensions (implemented in C) |
| Interpreter overhead per bytecode | Better algorithms and data structures; Python 3.11+ |
| GIL limits CPU threads | Multiprocessing, task queues, NumPy/Polars, Rust/C extensions |
| Most web apps wait on I/O anyway | Async I/O, connection pooling, caching |

---

## 11. Exercises

1. Use `dis.dis` on a small function and identify the bytecode for a loop.
2. Show that two variables point to the same list with `is` and `id`, then make a real copy.
3. Use `sys.getrefcount(obj)` before and after assigning an object to a second name.
4. Time a CPU-heavy function with 4 threads vs 4 processes and explain the difference.

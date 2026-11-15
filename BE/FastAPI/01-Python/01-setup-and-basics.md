# 01 · Setup and basics

## 1. Installing and running Python

> **In short:** Install Python 3.12+, then run code either interactively in the REPL or as a `.py` file.

- **Windows/macOS:** download from python.org (on Windows tick "Add Python to PATH"), or use a version manager.
- **Linux:** usually preinstalled; install a newer version with your package manager, `pyenv`, or `uv python install 3.12`.

```bash
python3 --version          # check (on some systems the command is `python`)
python3                    # interactive shell (REPL): type code, see results; exit() to leave
python3 hello.py           # run a file
```

```python
# hello.py
print("Hello, world!")
```

Use **VS Code** with the Python extension (or PyCharm). It gives you autocomplete, linting and a debugger.

### Indentation is syntax

> **In short:** Python groups code by indentation (4 spaces) instead of braces, so wrong indentation is an error.

Python uses **indentation** (4 spaces) instead of `{ }` to group code. Wrong indentation is an error.

```python
if True:
    print("inside")      # 4 spaces
print("outside")
```

Comments start with `#`. Multi-line strings `"""..."""` are used as documentation (**docstrings**).

---

## 2. Variables and types

> **In short:** Variables are names for values; Python works out the type at runtime (int, float, str, bool, None).

```python
name = "Anoop"          # str
age = 25                # int (any size, no overflow)
height = 1.75           # float
is_admin = False        # bool (capital T/F: True, False)
nothing = None          # "no value" (like null)

type(age)               # <class 'int'>
isinstance(age, int)    # True
```

- No `let`/`const`: just assign. A variable can later hold a different type (Python is **dynamically typed**).
- Naming: `snake_case` for variables and functions, `PascalCase` for classes, `UPPER_CASE` for constants (a convention; nothing enforces it).
- Multiple assignment: `x, y = 1, 2`; swap: `x, y = y, x`.

### Converting types

> **In short:** Convert explicitly with `int()`, `float()`, `str()`, `bool()`; know which values count as falsy.

```python
int("42")        # 42
int("4.2")       # ❌ ValueError
int(4.9)         # 4 (truncates)
float("3.5")     # 3.5
str(100)         # '100'
bool(0), bool(""), bool([]), bool(None)   # all False
bool("0"), bool([0])                      # True: non-empty
```

**Falsy values:** `False`, `None`, `0`, `0.0`, `""`, `[]`, `{}`, `()`, `set()`, `range(0)`. Everything else is truthy.

---

## 3. Operators

> **In short:** Arithmetic, comparison, logical (`and`/`or`/`not`), identity (`is`) and membership (`in`) operators.

```python
7 + 2      # 9
7 - 2      # 5
7 * 2      # 14
7 / 2      # 3.5   true division always gives a float
7 // 2     # 3     floor division
-7 // 2    # -4    ⚠️ floors toward negative infinity
7 % 2      # 1     remainder
2 ** 10    # 1024  power

x = 5
x += 1     # 6 (no x++ in Python)

# Comparison
3 == 3.0   # True
3 != 4     # True
1 < x < 10 # True: comparisons can be chained

# Logical: words, not symbols
True and False   # False
True or False    # True
not True         # False

# and/or return one of the operands (like JS)
name = "" or "Guest"    # 'Guest'

# Identity and membership
a is None              # identity: use `is` for None, True, False
"py" in "python"       # True
3 in [1, 2, 3]         # True
```

⚠️ `==` compares **values**; `is` compares **identity** (the same object). Always write `x is None`, not `x == None`.

Floats have the usual precision issue: `0.1 + 0.2 == 0.3` is `False`. Use `math.isclose()` or the `decimal` module for money.

---

## 4. Strings

> **In short:** Immutable text with indexing, slicing, f-string formatting and many helper methods.

```python
s = "Python"
s2 = 'single quotes work too'
multi = """Several
lines"""

len(s)          # 6
s[0]            # 'P'
s[-1]           # 'n'  (negative index from the end)
s[0:2]          # 'Py' (slicing, end excluded)
s[::-1]         # 'nohtyP' (reverse)

# f-strings: the way to format
name, price = "Pen", 12.5
f"{name} costs ₹{price:.2f}"          # 'Pen costs ₹12.50'
f"{1234567:,}"                         # '1,234,567'
f"{'left':<10}|{'right':>10}"          # padding/alignment
f"{price=}"                            # 'price=12.5' (debug helper)

# Common methods (strings are immutable: methods return new strings)
"  hi  ".strip()              # 'hi'
"hello".upper()               # 'HELLO'
"Hello World".lower()
"hello world".title()         # 'Hello World'
"a,b,c".split(",")            # ['a', 'b', 'c']
"-".join(["a", "b", "c"])     # 'a-b-c'
"hello".replace("l", "L")     # 'heLLo' (all occurrences)
"hello".startswith("he")      # True
"hello".find("l")             # 2 (-1 if missing)
"hello".count("l")            # 2
"42".isdigit()                # True
"abc".isalpha()

# Raw strings (no escape processing): handy for regex and Windows paths
r"C:\new\folder"
```

---

## 5. Input and output

> **In short:** `input()` reads text from the user (always a string) and `print()` writes output.

```python
name = input("Your name: ")          # always returns a str
age = int(input("Your age: "))       # convert yourself

print("a", "b", "c")                 # a b c
print("a", "b", sep="-")             # a-b
print("no newline", end="")
```

---

## 6. Conditions

> **In short:** `if`/`elif`/`else`, one-line conditional expressions, and `match` for pattern matching.

```python
score = 72

if score >= 90:
    grade = "A"
elif score >= 70:
    grade = "B"
else:
    grade = "C"

# Conditional expression (ternary)
label = "adult" if age >= 18 else "minor"

# match (structural pattern matching, Python 3.10+)
match command:
    case "start":
        start()
    case "stop" | "quit":
        stop()
    case _:                 # default
        print("unknown")
```

`match` can also destructure: `case {"type": "click", "x": x, "y": y}:` or `case [first, *rest]:`.

---

## 7. Loops

> **In short:** `for` loops over any iterable (with `range`, `enumerate`, `zip`); `while` repeats until a condition is false.

```python
for fruit in ["apple", "banana"]:
    print(fruit)

for i in range(5):            # 0, 1, 2, 3, 4
    print(i)
range(2, 10, 2)               # 2, 4, 6, 8 (start, stop, step)

for i, fruit in enumerate(["apple", "banana"], start=1):   # index + value
    print(i, fruit)

for name, age in zip(["A", "B"], [25, 30]):   # loop two lists together
    print(name, age)

count = 3
while count > 0:
    count -= 1

for n in range(10):
    if n == 2:
        continue        # skip
    if n == 5:
        break           # stop
else:
    print("runs only if the loop did NOT break")   # for/while ... else
```

`pass` is an empty statement (a placeholder where code is required): `if x: pass`.

---

## 8. Exercises

1. Ask for two numbers and print their sum, difference, product, true and floor division.
2. FizzBuzz from 1 to 100.
3. Ask for a word and print whether it's a palindrome.
4. Print a multiplication table for a number using an f-string with aligned columns.
5. Write a number-guessing game with `random.randint(1, 100)` and a `while` loop.

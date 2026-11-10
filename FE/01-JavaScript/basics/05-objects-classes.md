# 05 · Objects and classes

An **object** groups related data and behaviour using **key–value pairs**. Keys are called **properties**; functions stored in properties are called **methods**.

## 1. Creating objects and reading properties

```js
const user = {
  name: 'Anoop',
  age: 25,
  'favourite color': 'blue',   // keys with spaces/dashes need quotes
  address: { city: 'Kochi' },  // nested object
  greet() {                    // method (short syntax)
    return `Hi, I'm ${this.name}`;
  },
};

// Dot notation
user.name;                 // 'Anoop'
user.address.city;         // 'Kochi'
user.greet();              // "Hi, I'm Anoop"

// Bracket notation: for special keys or keys stored in a variable
user['favourite color'];   // 'blue'
const field = 'age';
user[field];               // 25
user.field;                // undefined ⚠️ looks for a key literally called "field"

user.phone;                // undefined (missing keys don't throw)
user.phone.number;         // ❌ TypeError: cannot read properties of undefined
user.phone?.number;        // undefined ✅
```

## 2. Adding, changing and deleting

```js
user.email = 'a@b.com';    // add
user.age = 26;             // change
delete user.email;         // remove (rarely used; prefer creating a new object)
```

### Checking if a property exists

```js
'name' in user;                     // true (also checks inherited properties)
Object.hasOwn(user, 'name');        // true (own properties only, modern)
user.name !== undefined;            // works unless the value IS undefined
```

## 3. Shorthand and computed properties

```js
const name = 'Anoop';
const age = 25;

const person = { name, age };       // shorthand for { name: name, age: age }

const key = 'score';
const stats = { [key]: 100, [`${key}Max`]: 200 };  // computed keys → { score: 100, scoreMax: 200 }
```

---

## 4. Looping over objects

```js
const prices = { pen: 10, book: 250, bag: 900 };

Object.keys(prices);     // ['pen', 'book', 'bag']
Object.values(prices);   // [10, 250, 900]
Object.entries(prices);  // [['pen', 10], ['book', 250], ['bag', 900]]

for (const [item, price] of Object.entries(prices)) {
  console.log(`${item}: ₹${price}`);
}

// entries → transform → back to an object
const discounted = Object.fromEntries(
  Object.entries(prices).map(([k, v]) => [k, v * 0.9])
);
```

---

## 5. Destructuring objects

```js
const user = { name: 'Anoop', age: 25, address: { city: 'Kochi' } };

const { name, age } = user;                    // name='Anoop', age=25
const { name: userName } = user;               // rename → userName='Anoop'
const { role = 'user' } = user;                // default if missing/undefined
const { address: { city } } = user;            // nested → city='Kochi'
const { name: n, ...others } = user;           // rest → others = { age, address }

// In function parameters (very common in React components)
function Profile({ name, age }) { /* ... */ }
```

⚠️ Destructuring `null` or `undefined` throws: `const { a } = null;` → TypeError. Use a default: `const { a } = maybeObj ?? {};`.

---

## 6. Spread with objects, and copying

```js
const base = { theme: 'light', lang: 'en' };
const settings = { ...base, lang: 'ml' };     // copy + override → { theme: 'light', lang: 'ml' }
// later keys win: { lang: 'ml', ...base } would give lang: 'en'

const merged = { ...a, ...b };                // merge two objects
const copy = { ...user };                     // shallow copy
Object.assign({}, a, b);                      // older way to merge (same result)
```

### Shallow vs deep copy

```js
const user = { name: 'A', address: { city: 'Kochi' } };
const shallow = { ...user };
shallow.address.city = 'Pune';
user.address.city;               // 'Pune' ⚠️ nested object is shared

const deep = structuredClone(user);   // ✅ full deep copy
```

### Updating nested data immutably (React style)

```js
const updated = {
  ...user,
  address: { ...user.address, city: 'Pune' },   // copy every level you change
};
```

---

## 7. Comparing objects

```js
{ a: 1 } === { a: 1 };   // false: different objects in memory
const x = { a: 1 };
const y = x;
x === y;                  // true: same reference
```

There's no built-in deep equality. Compare specific fields, or use a helper (`lodash.isEqual`). `JSON.stringify(a) === JSON.stringify(b)` works only for simple data with the same key order.

---

## 8. JSON

**JSON** (JavaScript Object Notation) is a **text format** for sending data, for example between your app and an API.

```js
const user = { name: 'Anoop', age: 25, active: true };

const text = JSON.stringify(user);         // '{"name":"Anoop","age":25,"active":true}'
JSON.stringify(user, null, 2);             // pretty-printed with 2-space indentation
const back = JSON.parse(text);             // back to an object

JSON.parse('not json');                    // ❌ SyntaxError: always wrap untrusted input in try/catch
```

What `JSON.stringify` does with special values:

```js
JSON.stringify({ a: undefined, f() {}, s: Symbol() }); // '{}'  these are dropped
JSON.stringify([undefined, () => {}]);                 // '[null,null]'
JSON.stringify({ d: new Date(0) });                    // '{"d":"1970-01-01T00:00:00.000Z"}' (string!)
JSON.stringify({ n: NaN, i: Infinity });               // '{"n":null,"i":null}'
JSON.stringify(new Map([[1, 2]]));                     // '{}'
// circular references → TypeError
```

---

## 9. Freezing objects

```js
const config = Object.freeze({ api: '/v1', nested: { x: 1 } });
config.api = '/v2';       // ignored (throws in strict mode)
config.nested.x = 2;      // ⚠️ works: freeze is shallow
Object.isFrozen(config);  // true
```

---

## 10. Classes

A **class** is a blueprint for creating many objects with the same shape and methods.

```js
class Animal {
  // public field with a default value
  legs = 4;

  // private field: only accessible inside the class
  #id;

  // static: belongs to the class itself, not to instances
  static count = 0;

  // runs when you call new Animal(...)
  constructor(name) {
    this.name = name;
    this.#id = ++Animal.count;
  }

  // method shared by all instances
  speak() {
    return `${this.name} makes a sound`;
  }

  // getter: read like a property
  get id() {
    return this.#id;
  }

  // setter: assign like a property, with validation
  set nickname(value) {
    if (!value) throw new Error('Nickname required');
    this._nickname = value;
  }

  static create(name) {
    return new Animal(name);
  }
}

const cat = new Animal('Tom');
cat.speak();        // 'Tom makes a sound'
cat.id;             // 1   (getter, no parentheses)
// cat.#id;         // ❌ SyntaxError: private
Animal.count;       // 1   (static)
```

### Inheritance with `extends` and `super`

```js
class Dog extends Animal {
  constructor(name, breed) {
    super(name);           // ⚠️ must call super() before using this
    this.breed = breed;
  }

  speak() {                // override the parent method
    return `${super.speak()}: Woof!`;   // call the parent's version
  }
}

const rex = new Dog('Rex', 'Labrador');
rex.speak();                // 'Rex makes a sound: Woof!'
rex instanceof Dog;         // true
rex instanceof Animal;      // true
```

### Class gotchas

- Classes are **not hoisted** like function declarations: define the class before `new`.
- Forgetting `new` throws: `Animal('x')` → TypeError.
- Passing a method as a callback loses `this` (`button.onclick = cat.speak`). Fix with an arrow-function field `speak = () => {...}` or `.bind(this)`.
- Class bodies always run in strict mode.

---

## 11. Prototypes (what classes are built on)

Every object has a hidden link to another object, its **prototype**. When a property isn't found on the object, JS looks it up the **prototype chain**.

```js
const arr = [1, 2];
arr.map;                       // not on arr itself → found on Array.prototype
Object.getPrototypeOf(arr) === Array.prototype;   // true

// What class does under the hood (old-style constructor function)
function Person(name) { this.name = name; }
Person.prototype.greet = function () { return `Hi ${this.name}`; };
new Person('A').greet();       // 'Hi A'
```

`class` is mostly a nicer syntax over this prototype system. Methods live once on the prototype, not copied into every instance.

---

## 12. Exercises

1. Create a `book` object with `title`, `author`, `year` and a `describe()` method. Destructure `title` and `year`.
2. Write `updateCity(user, city)` that returns a **new** user with a new nested address, without changing the original.
3. Convert `{ a: 1, b: 2, c: 3 }` into `{ a: 2, b: 4, c: 6 }` using `Object.entries` / `Object.fromEntries`.
4. Write a `BankAccount` class with a private `#balance`, `deposit`, `withdraw` (throw if not enough money) and a `balance` getter. Extend it into `SavingsAccount` with `addInterest(rate)`.

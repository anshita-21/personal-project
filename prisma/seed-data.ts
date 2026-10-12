/**
 * Deterministic seed content.
 *
 * Kept separate from seed.ts so the content is reviewable as data and the seed
 * script stays a short, idempotent loader. Everything here is written by hand -
 * no lorem ipsum - because the point of the seed is that a reviewer can open the
 * app and take a real exam.
 */

export interface SeedOption {
  text: string;
  correct?: boolean;
}

export interface SeedQuestion {
  prompt: string;
  topic: string;
  points?: number;
  explanation: string;
  options: SeedOption[];
}

export interface SeedExam {
  title: string;
  slug: string;
  description: string;
  topic: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  durationMinutes: number;
  passPercentage: number;
  status: 'DRAFT' | 'PUBLISHED';
  questions: SeedQuestion[];
}

export const TOPICS: { name: string; slug: string; description: string }[] = [
  {
    name: 'JavaScript',
    slug: 'javascript',
    description: 'Language fundamentals, scope, types, and asynchronous behaviour.',
  },
  {
    name: 'TypeScript',
    slug: 'typescript',
    description: 'Static typing, generics, narrowing, and compiler behaviour.',
  },
  {
    name: 'Databases & SQL',
    slug: 'databases-sql',
    description: 'Relational modelling, querying, indexing, and transactions.',
  },
  {
    name: 'Web & APIs',
    slug: 'web-and-apis',
    description: 'HTTP semantics, REST design, browser behaviour, and web security.',
  },
  {
    name: 'Data Structures',
    slug: 'data-structures',
    description: 'Core structures and the complexity of operations on them.',
  },
  {
    name: 'Angular & RxJS',
    slug: 'angular-rxjs',
    description: 'Components, change detection, forms, and reactive streams.',
  },
];

export const EXAMS: SeedExam[] = [
  {
    title: 'JavaScript Essentials',
    slug: 'javascript-essentials',
    description:
      'A warm-up paper covering variables, types, equality, arrays and functions. Start here if you want a baseline score before attempting the harder papers.',
    topic: 'JavaScript',
    difficulty: 'EASY',
    durationMinutes: 15,
    passPercentage: 60,
    status: 'PUBLISHED',
    questions: [
      {
        prompt: 'What does `typeof null` evaluate to in JavaScript?',
        topic: 'JavaScript',
        explanation:
          "`typeof null` returns the string 'object'. It is a long-standing bug kept for backwards compatibility; use `value === null` to test for null.",
        options: [
          { text: "'null'" },
          { text: "'object'", correct: true },
          { text: "'undefined'" },
          { text: "'boolean'" },
        ],
      },
      {
        prompt: 'Which comparison evaluates to `true`?',
        topic: 'JavaScript',
        explanation:
          "`'2' == 2` is true because `==` coerces the string to a number. `===` compares without coercion, so `'2' === 2` is false.",
        options: [
          { text: "'2' === 2" },
          { text: "'2' == 2", correct: true },
          { text: 'NaN === NaN' },
          { text: '[] === []' },
        ],
      },
      {
        prompt: 'What is the difference between `let` and `var`?',
        topic: 'JavaScript',
        explanation:
          '`var` is function-scoped and hoisted as `undefined`; `let` is block-scoped and stays in the temporal dead zone until its declaration is evaluated.',
        options: [
          { text: '`let` is block-scoped, `var` is function-scoped', correct: true },
          { text: '`let` cannot be reassigned, `var` can' },
          { text: 'They are identical; `let` is only newer syntax' },
          { text: '`var` is block-scoped, `let` is global' },
        ],
      },
      {
        prompt: 'What does `[1, 2, 3].map(n => n * 2)` return?',
        topic: 'JavaScript',
        explanation:
          '`map` returns a NEW array of the same length containing the results of the callback. The original array is untouched.',
        options: [
          { text: '[2, 4, 6]', correct: true },
          { text: '[1, 2, 3]' },
          { text: '6' },
          { text: 'undefined' },
        ],
      },
      {
        prompt: 'Which method removes the LAST element of an array and returns it?',
        topic: 'JavaScript',
        explanation:
          '`pop()` removes and returns the last element. `shift()` does the same at the front, and `slice()` does not mutate at all.',
        options: [
          { text: 'shift()' },
          { text: 'pop()', correct: true },
          { text: 'slice(-1)' },
          { text: 'splice(0, 1)' },
        ],
      },
      {
        prompt: 'What is the value of `x` after `const x = [1, 2] + [3];`?',
        topic: 'JavaScript',
        explanation:
          "The `+` operator converts both arrays to strings first, so you get '1,2' + '3' = '1,23'. Use `concat` or spread to join arrays.",
        options: [
          { text: '[1, 2, 3]' },
          { text: "'1,23'", correct: true },
          { text: '6' },
          { text: 'TypeError' },
        ],
      },
      {
        prompt: 'In a regular (non-arrow) function, what determines the value of `this`?',
        topic: 'JavaScript',
        explanation:
          'For a normal function, `this` is bound at call time by how the function is called. Arrow functions instead capture `this` from the enclosing lexical scope.',
        options: [
          { text: 'How the function is called', correct: true },
          { text: 'Where the function is defined' },
          { text: 'It is always the global object' },
          { text: 'It is always `undefined` in modules' },
        ],
      },
      {
        prompt: 'Which statement about `const` is correct?',
        topic: 'JavaScript',
        explanation:
          '`const` prevents REBINDING the identifier, not mutation of the value. `const a = []; a.push(1)` is legal; `a = []` is not.',
        options: [
          { text: 'The binding cannot be reassigned, but objects it holds can be mutated', correct: true },
          { text: 'The value is deeply immutable' },
          { text: 'It behaves exactly like `var`' },
          { text: 'It can be declared without an initialiser' },
        ],
      },
    ],
  },

  {
    title: 'Asynchronous JavaScript in Depth',
    slug: 'asynchronous-javascript-in-depth',
    description:
      'Promises, the event loop, microtasks and error handling. Expect questions where the ordering of output is the whole point.',
    topic: 'JavaScript',
    difficulty: 'HARD',
    durationMinutes: 25,
    passPercentage: 65,
    status: 'PUBLISHED',
    questions: [
      {
        prompt:
          'What is logged?\n\n```js\nconsole.log(1);\nsetTimeout(() => console.log(2), 0);\nPromise.resolve().then(() => console.log(3));\nconsole.log(4);\n```',
        topic: 'JavaScript',
        points: 2,
        explanation:
          'Synchronous code runs first (1, 4). The microtask queue (promise callbacks) is drained before the macrotask queue (timers), so 3 precedes 2.',
        options: [
          { text: '1, 4, 3, 2', correct: true },
          { text: '1, 4, 2, 3' },
          { text: '1, 2, 3, 4' },
          { text: '1, 3, 4, 2' },
        ],
      },
      {
        prompt: 'What does `Promise.all` do when one of its promises rejects?',
        topic: 'JavaScript',
        explanation:
          'It rejects immediately with that first rejection reason. The other promises keep running - they are not cancelled. `Promise.allSettled` waits for every outcome instead.',
        options: [
          { text: 'Rejects immediately with the first rejection reason', correct: true },
          { text: 'Waits for all promises, then rejects with an array of reasons' },
          { text: 'Resolves with the successful values and ignores failures' },
          { text: 'Cancels the remaining promises' },
        ],
      },
      {
        prompt: 'Which pattern correctly catches an error thrown inside an async function?',
        topic: 'JavaScript',
        explanation:
          'An async function returns a promise, so a throw inside it becomes a rejection. `try/catch` around the `await`, or `.catch()` on the returned promise, both work; a plain `try/catch` around the CALL without `await` does not.',
        options: [
          { text: 'try { await work(); } catch (e) { ... }', correct: true },
          { text: 'try { work(); } catch (e) { ... }' },
          { text: 'work().error(e => ...)' },
          { text: 'Errors in async functions cannot be caught' },
        ],
      },
      {
        prompt: 'What is the difference between a microtask and a macrotask?',
        topic: 'JavaScript',
        explanation:
          'The whole microtask queue is drained after the current task and before the next macrotask, so promise continuations always run before the next timer callback.',
        options: [
          {
            text: 'Microtasks drain fully after the current task, before the next macrotask',
            correct: true,
          },
          { text: 'Macrotasks always run first' },
          { text: 'They run on separate threads' },
          { text: 'There is no ordering guarantee between them' },
        ],
      },
      {
        prompt: 'Why can `await` inside a `for` loop be a performance problem?',
        topic: 'JavaScript',
        points: 2,
        explanation:
          'Each iteration waits for the previous one, serialising work that could overlap. If the operations are independent, start them all and `await Promise.all(...)`.',
        options: [
          { text: 'It serialises independent operations that could run concurrently', correct: true },
          { text: 'It blocks the event loop and freezes the process' },
          { text: 'It silently swallows rejections' },
          { text: 'It is a syntax error in strict mode' },
        ],
      },
      {
        prompt: 'What does an `async` function return?',
        topic: 'JavaScript',
        explanation:
          'Always a promise. A returned non-promise value is wrapped with `Promise.resolve`, and a thrown error becomes a rejected promise.',
        options: [
          { text: 'A promise, always', correct: true },
          { text: 'The resolved value directly' },
          { text: 'A generator' },
          { text: 'undefined unless it is awaited' },
        ],
      },
      {
        prompt:
          'A fetch wrapper resolves even when the server returns 500. Why?',
        topic: 'Web & APIs',
        explanation:
          '`fetch` only rejects on network-level failures. An HTTP error status is a successful round trip, so you must check `response.ok` yourself.',
        options: [
          { text: '`fetch` only rejects on network failure, not on HTTP error status', correct: true },
          { text: '`fetch` never rejects at all' },
          { text: 'The server must send a `Reject` header' },
          { text: '500 responses are retried transparently' },
        ],
      },
      {
        prompt: 'Which is the correct way to run two independent async calls concurrently?',
        topic: 'JavaScript',
        explanation:
          'Starting both promises before awaiting lets them overlap. Awaiting the first before starting the second serialises them.',
        options: [
          { text: 'const [a, b] = await Promise.all([first(), second()]);', correct: true },
          { text: 'const a = await first(); const b = await second();' },
          { text: 'await first(); await second();' },
          { text: 'Promise.race([first(), second()]);' },
        ],
      },
    ],
  },

  {
    title: 'TypeScript Type System',
    slug: 'typescript-type-system',
    description:
      'Generics, narrowing, structural typing and the practical difference between compile-time and runtime guarantees.',
    topic: 'TypeScript',
    difficulty: 'MEDIUM',
    durationMinutes: 20,
    passPercentage: 60,
    status: 'PUBLISHED',
    questions: [
      {
        prompt: 'What is the difference between `unknown` and `any`?',
        topic: 'TypeScript',
        explanation:
          '`unknown` is the type-safe counterpart of `any`: you must narrow it before use. `any` disables checking entirely and silently spreads.',
        options: [
          { text: '`unknown` must be narrowed before use; `any` disables checking', correct: true },
          { text: 'They are identical' },
          { text: '`unknown` only applies to function parameters' },
          { text: '`any` is checked at runtime' },
        ],
      },
      {
        prompt: 'What does the `strictNullChecks` compiler option change?',
        topic: 'TypeScript',
        explanation:
          'With it on, `null` and `undefined` are not assignable to other types, so the compiler forces you to handle the empty case.',
        options: [
          { text: '`null` and `undefined` stop being assignable to every type', correct: true },
          { text: 'It inserts runtime null checks' },
          { text: 'It makes every property optional' },
          { text: 'It only affects `.d.ts` files' },
        ],
      },
      {
        prompt: 'Why does TypeScript accept an object with extra properties assigned via a variable?',
        topic: 'TypeScript',
        points: 2,
        explanation:
          "TypeScript is structurally typed: a value is assignable if it has at least the required members. Excess-property checking only applies to fresh object literals, not to values that arrive through a variable.",
        options: [
          {
            text: 'The type system is structural, and excess-property checks apply only to fresh literals',
            correct: true,
          },
          { text: 'Extra properties are always an error' },
          { text: 'Because the variable was declared with `const`' },
          { text: 'Because interfaces are erased at runtime' },
        ],
      },
      {
        prompt: 'What does `keyof` produce for `interface User { id: string; age: number }`?',
        topic: 'TypeScript',
        explanation:
          "`keyof User` is the union of its property names: `'id' | 'age'`.",
        options: [
          { text: "'id' | 'age'", correct: true },
          { text: 'string | number' },
          { text: 'User[]' },
          { text: "{ id: 'id', age: 'age' }" },
        ],
      },
      {
        prompt: 'Which construct narrows a union at runtime in a way the compiler understands?',
        topic: 'TypeScript',
        explanation:
          'A discriminated union plus a `switch` on the discriminant narrows in each branch, and the compiler can check exhaustiveness.',
        options: [
          { text: 'A discriminated union with a `switch` on the tag field', correct: true },
          { text: 'A type assertion with `as`' },
          { text: 'Declaring the variable as `any`' },
          { text: 'A non-null assertion `!`' },
        ],
      },
      {
        prompt: 'What happens to interfaces and types when TypeScript compiles to JavaScript?',
        topic: 'TypeScript',
        explanation:
          'They are erased completely. Nothing about them exists at runtime, which is why request payloads still need runtime validation (for example with Zod).',
        options: [
          { text: 'They are erased - no runtime representation remains', correct: true },
          { text: 'They become runtime classes' },
          { text: 'They become JSON Schema documents' },
          { text: 'They are kept in a sidecar file and checked at runtime' },
        ],
      },
      {
        prompt: 'What is the purpose of a generic constraint such as `<T extends { id: string }>`?',
        topic: 'TypeScript',
        explanation:
          'It lets the function rely on members of `T` while still returning the caller\'s precise type, instead of widening to the constraint.',
        options: [
          {
            text: 'It guarantees `T` has those members while preserving the caller\'s exact type',
            correct: true,
          },
          { text: 'It converts `T` into the constraint type' },
          { text: 'It is only documentation and has no effect' },
          { text: 'It forces `T` to be a class' },
        ],
      },
      {
        prompt: 'Why is `as` (a type assertion) risky?',
        topic: 'TypeScript',
        explanation:
          'An assertion tells the compiler to stop checking; it performs no conversion or validation, so a wrong assertion fails at runtime instead of at build time.',
        options: [
          { text: 'It silences the compiler without verifying anything at runtime', correct: true },
          { text: 'It is slower than a type guard' },
          { text: 'It only works on primitives' },
          { text: 'It mutates the value' },
        ],
      },
    ],
  },

  {
    title: 'SQL Query Fundamentals',
    slug: 'sql-query-fundamentals',
    description:
      'Joins, aggregation, NULL semantics, indexes and transactions - the queries you actually write against a relational database.',
    topic: 'Databases & SQL',
    difficulty: 'EASY',
    durationMinutes: 20,
    passPercentage: 60,
    status: 'PUBLISHED',
    questions: [
      {
        prompt: 'What does an INNER JOIN return?',
        topic: 'Databases & SQL',
        explanation:
          'Only rows with a match on both sides. LEFT JOIN keeps unmatched rows from the left table with NULLs for the right.',
        options: [
          { text: 'Only rows that match in both tables', correct: true },
          { text: 'All rows from the left table' },
          { text: 'All rows from both tables' },
          { text: 'Rows that match in neither table' },
        ],
      },
      {
        prompt: 'What is the result of `NULL = NULL` in SQL?',
        topic: 'Databases & SQL',
        explanation:
          'It is NULL (unknown), not true. Use `IS NULL` / `IS NOT DISTINCT FROM` to compare possibly-null values.',
        options: [
          { text: 'NULL (unknown)', correct: true },
          { text: 'true' },
          { text: 'false' },
          { text: 'A syntax error' },
        ],
      },
      {
        prompt: 'Which clause filters rows AFTER aggregation?',
        topic: 'Databases & SQL',
        explanation:
          'WHERE filters rows before grouping; HAVING filters the grouped results, so aggregate conditions belong there.',
        options: [
          { text: 'HAVING', correct: true },
          { text: 'WHERE' },
          { text: 'GROUP BY' },
          { text: 'ORDER BY' },
        ],
      },
      {
        prompt: 'Why does `OFFSET 1000 LIMIT 10` get slower as the offset grows?',
        topic: 'Databases & SQL',
        points: 2,
        explanation:
          'The database must still produce and discard the skipped rows. Keyset ("seek") pagination with a WHERE on the last seen key stays constant-time.',
        options: [
          { text: 'The skipped rows are still generated and then thrown away', correct: true },
          { text: 'LIMIT disables all indexes' },
          { text: 'The result set is sorted twice' },
          { text: 'It locks the table' },
        ],
      },
      {
        prompt: 'What does a UNIQUE index guarantee?',
        topic: 'Databases & SQL',
        explanation:
          'No two rows may share the indexed value - enforced by the database itself, so a race between two application processes cannot create a duplicate.',
        options: [
          { text: 'No two rows share the same value for the indexed columns', correct: true },
          { text: 'Lookups are always O(1)' },
          { text: 'The column cannot contain NULL' },
          { text: 'Writes become faster' },
        ],
      },
      {
        prompt: 'What does wrapping two writes in a transaction give you?',
        topic: 'Databases & SQL',
        explanation:
          'Atomicity: either both writes are visible or neither is. Without it a crash between them leaves the data inconsistent.',
        options: [
          { text: 'Both writes commit together or neither does', correct: true },
          { text: 'The writes run in parallel' },
          { text: 'A performance improvement' },
          { text: 'Automatic retry on failure' },
        ],
      },
      {
        prompt: 'Which query is safe from SQL injection?',
        topic: 'Databases & SQL',
        explanation:
          'A parameterised query sends the value separately from the statement, so it can never be parsed as SQL. String concatenation - escaped or not - can be.',
        options: [
          { text: 'A parameterised query with bound values', correct: true },
          { text: 'Concatenation after escaping quotes' },
          { text: 'Concatenation inside a stored procedure' },
          { text: 'Any query sent over TLS' },
        ],
      },
      {
        prompt: 'When is a composite index on (a, b) useful for a query filtering only on `b`?',
        topic: 'Databases & SQL',
        explanation:
          'Generally not: a composite index is ordered by its leading column, so a predicate on `b` alone cannot seek. A separate index on `b` is needed.',
        options: [
          { text: 'Rarely - the leading column must be constrained to seek efficiently', correct: true },
          { text: 'Always; column order does not matter' },
          { text: 'Only when `b` is unique' },
          { text: 'Only for DELETE statements' },
        ],
      },
    ],
  },

  {
    title: 'HTTP, REST & Web Security',
    slug: 'http-rest-and-web-security',
    description:
      'Status codes, idempotency, caching, CORS, cookies and the attacks they exist to prevent.',
    topic: 'Web & APIs',
    difficulty: 'MEDIUM',
    durationMinutes: 25,
    passPercentage: 65,
    status: 'PUBLISHED',
    questions: [
      {
        prompt: 'Which HTTP methods are expected to be idempotent?',
        topic: 'Web & APIs',
        explanation:
          'GET, PUT and DELETE are idempotent: repeating the request leaves the server in the same state. POST is not, which is why retries need an idempotency strategy.',
        options: [
          { text: 'GET, PUT, DELETE', correct: true },
          { text: 'POST, PUT, PATCH' },
          { text: 'Only GET' },
          { text: 'All of them' },
        ],
      },
      {
        prompt: 'Which status code should a server return when the caller is authenticated but not allowed?',
        topic: 'Web & APIs',
        explanation:
          '401 means "we do not know who you are"; 403 means "we know, and you still may not". Returning 404 instead is a deliberate choice when even existence is sensitive.',
        options: [
          { text: '403 Forbidden', correct: true },
          { text: '401 Unauthorized' },
          { text: '400 Bad Request' },
          { text: '500 Internal Server Error' },
        ],
      },
      {
        prompt: 'What does the `httpOnly` cookie attribute prevent?',
        topic: 'Web & APIs',
        explanation:
          'It stops `document.cookie` from reading the value, so an XSS payload cannot exfiltrate the session. It does nothing about CSRF - that is what SameSite is for.',
        options: [
          { text: 'JavaScript on the page from reading the cookie', correct: true },
          { text: 'The cookie from being sent over HTTP' },
          { text: 'Cross-site request forgery' },
          { text: 'The cookie from being stored at all' },
        ],
      },
      {
        prompt: 'What problem does `SameSite=Lax` on a session cookie mitigate?',
        topic: 'Web & APIs',
        points: 2,
        explanation:
          'The browser will not attach the cookie to a cross-site state-changing request, which removes the classic CSRF vector without a per-form token.',
        options: [
          { text: 'Cross-site request forgery', correct: true },
          { text: 'Cross-site scripting' },
          { text: 'SQL injection' },
          { text: 'Clickjacking' },
        ],
      },
      {
        prompt: 'Why is `Access-Control-Allow-Origin: *` incompatible with credentialed requests?',
        topic: 'Web & APIs',
        points: 2,
        explanation:
          'With credentials the browser requires a specific origin, because a wildcard would let any site read authenticated responses. Echo an allow-listed origin instead.',
        options: [
          {
            text: 'Browsers refuse the wildcard when credentials are included, as any site could then read private responses',
            correct: true,
          },
          { text: 'It is allowed but slower' },
          { text: 'It only fails on GET requests' },
          { text: 'Because cookies are never sent cross-origin' },
        ],
      },
      {
        prompt: 'A client retries a POST whose response was lost. How do you avoid a duplicate record?',
        topic: 'Web & APIs',
        explanation:
          'Make the operation idempotent server-side - a conditional update on current state, a unique constraint, or an idempotency key - rather than hoping the client never retries.',
        options: [
          { text: 'Make the server-side operation idempotent', correct: true },
          { text: 'Disable the submit button in the UI' },
          { text: 'Return 200 instead of 201' },
          { text: 'Use a longer request timeout' },
        ],
      },
      {
        prompt: 'What does a 409 Conflict typically mean?',
        topic: 'Web & APIs',
        explanation:
          'The request is well-formed but conflicts with the current state of the resource - for example submitting an attempt that is already graded.',
        options: [
          { text: 'The request conflicts with the current state of the resource', correct: true },
          { text: 'The request body failed validation' },
          { text: 'The caller is rate limited' },
          { text: 'The resource was permanently removed' },
        ],
      },
      {
        prompt: 'Why should an API never trust a score or a timestamp sent by the browser?',
        topic: 'Web & APIs',
        explanation:
          'Anything the client sends is attacker-controlled. Authoritative values - scores, deadlines, prices - must be derived on the server.',
        options: [
          { text: 'The client is fully attacker-controlled, so such values must be derived server-side', correct: true },
          { text: 'Because JSON cannot represent dates' },
          { text: 'Because of time-zone differences only' },
          { text: 'Because HTTPS does not protect request bodies' },
        ],
      },
      {
        prompt: 'What is the main purpose of rate limiting an authentication endpoint?',
        topic: 'Web & APIs',
        explanation:
          'It makes online password guessing impractical and limits the damage of credential-stuffing lists.',
        options: [
          { text: 'To make brute-force credential guessing impractical', correct: true },
          { text: 'To reduce database size' },
          { text: 'To improve cache hit rates' },
          { text: 'To comply with CORS' },
        ],
      },
      {
        prompt: 'Which response header set makes a JSON API response uncacheable by a shared cache?',
        topic: 'Web & APIs',
        explanation:
          '`Cache-Control: no-store` tells every cache not to keep a copy, which is what you want for per-user authenticated payloads.',
        options: [
          { text: 'Cache-Control: no-store', correct: true },
          { text: 'Content-Type: application/json' },
          { text: 'Connection: close' },
          { text: 'Vary: Accept-Encoding' },
        ],
      },
    ],
  },

  {
    title: 'Data Structures & Complexity',
    slug: 'data-structures-and-complexity',
    description:
      'Arrays, hash maps, trees, heaps and graphs, and the time and space cost of operating on them.',
    topic: 'Data Structures',
    difficulty: 'HARD',
    durationMinutes: 30,
    passPercentage: 65,
    status: 'PUBLISHED',
    questions: [
      {
        prompt: 'What is the average-case time complexity of a hash map lookup?',
        topic: 'Data Structures',
        explanation:
          'O(1) on average with a good hash function and bounded load factor; O(n) in the worst case when every key collides.',
        options: [
          { text: 'O(1)', correct: true },
          { text: 'O(log n)' },
          { text: 'O(n)' },
          { text: 'O(n log n)' },
        ],
      },
      {
        prompt: 'Which structure gives O(1) insertion and removal at BOTH ends?',
        topic: 'Data Structures',
        explanation:
          'A doubly linked list (or a deque built on a ring buffer). A dynamic array is O(n) at the front because every element shifts.',
        options: [
          { text: 'A doubly linked list / deque', correct: true },
          { text: 'A dynamic array' },
          { text: 'A binary search tree' },
          { text: 'A min-heap' },
        ],
      },
      {
        prompt: 'What does a min-heap guarantee?',
        topic: 'Data Structures',
        explanation:
          'Only that each parent is <= its children, so the minimum is at the root. It is not fully sorted - in-order traversal is meaningless.',
        options: [
          { text: 'Every parent is less than or equal to its children', correct: true },
          { text: 'The elements are fully sorted' },
          { text: 'Lookup of an arbitrary element is O(log n)' },
          { text: 'It is always balanced to within one node' },
        ],
      },
      {
        prompt: 'Why can a binary search tree degrade to O(n) lookups?',
        topic: 'Data Structures',
        points: 2,
        explanation:
          'Inserting sorted data makes the tree a linked list. Self-balancing variants (AVL, red-black) keep the height O(log n).',
        options: [
          { text: 'Sorted insertions make it degenerate into a linked list', correct: true },
          { text: 'Because comparisons are O(n)' },
          { text: 'Because it stores duplicates' },
          { text: 'Only if it holds more than 2^32 nodes' },
        ],
      },
      {
        prompt: 'Which traversal finds the shortest path in an UNWEIGHTED graph?',
        topic: 'Data Structures',
        explanation:
          'Breadth-first search explores by distance, so the first time it reaches a node it has used the fewest edges. Dijkstra generalises this to weighted edges.',
        options: [
          { text: 'Breadth-first search', correct: true },
          { text: 'Depth-first search' },
          { text: 'Post-order traversal' },
          { text: 'Topological sort' },
        ],
      },
      {
        prompt: 'What is the complexity of appending n items to a dynamic array?',
        topic: 'Data Structures',
        points: 2,
        explanation:
          'O(n) total - amortised O(1) per append. Doubling the capacity makes the occasional copy rare enough to average out.',
        options: [
          { text: 'O(n) total, amortised O(1) per append', correct: true },
          { text: 'O(n^2) total' },
          { text: 'O(n log n) total' },
          { text: 'O(1) total' },
        ],
      },
      {
        prompt: 'When is a sorted array preferable to a hash map?',
        topic: 'Data Structures',
        explanation:
          'When you need ordered operations - range queries, nearest-neighbour, in-order iteration. A hash map has no useful order.',
        options: [
          { text: 'When range queries or ordered iteration are needed', correct: true },
          { text: 'When lookups must be O(1)' },
          { text: 'When keys are strings' },
          { text: 'When the data set is tiny' },
        ],
      },
      {
        prompt: 'What problem does a trie solve better than a hash map?',
        topic: 'Data Structures',
        explanation:
          'Prefix queries: a trie can enumerate every key sharing a prefix in time proportional to the prefix plus the number of results.',
        options: [
          { text: 'Prefix search over a set of strings', correct: true },
          { text: 'Exact-match lookup of integers' },
          { text: 'Maintaining insertion order' },
          { text: 'Constant-memory counting' },
        ],
      },
      {
        prompt: 'Why is the worst case of quicksort O(n^2)?',
        topic: 'Data Structures',
        explanation:
          'A consistently extreme pivot splits off one element at a time, producing n levels of partitioning. Random or median-of-three pivots make this vanishingly unlikely.',
        options: [
          { text: 'A bad pivot choice repeatedly produces a 1-to-(n-1) split', correct: true },
          { text: 'Because it is not stable' },
          { text: 'Because it needs O(n) extra memory' },
          { text: 'Because comparisons are O(log n)' },
        ],
      },
      {
        prompt: 'Which structure underpins an LRU cache with O(1) get and put?',
        topic: 'Data Structures',
        points: 2,
        explanation:
          'A hash map for O(1) lookup plus a doubly linked list for O(1) recency reordering and eviction of the tail.',
        options: [
          { text: 'A hash map combined with a doubly linked list', correct: true },
          { text: 'A balanced binary search tree' },
          { text: 'A max-heap' },
          { text: 'A circular array alone' },
        ],
      },
    ],
  },

  {
    title: 'Angular & RxJS Patterns',
    slug: 'angular-and-rxjs-patterns',
    description:
      'Change detection, reactive forms, dependency injection and stream composition. Still being authored - this paper demonstrates the draft and publish workflow in the admin area.',
    topic: 'Angular & RxJS',
    difficulty: 'MEDIUM',
    durationMinutes: 20,
    passPercentage: 60,
    status: 'DRAFT',
    questions: [
      {
        prompt: 'What does the `async` pipe do when a component is destroyed?',
        topic: 'Angular & RxJS',
        explanation:
          'It unsubscribes automatically, which is why it is the preferred way to render an observable and avoid a subscription leak.',
        options: [
          { text: 'Unsubscribes from the observable automatically', correct: true },
          { text: 'Keeps the subscription for reuse' },
          { text: 'Replays the last value to the next component' },
          { text: 'Nothing - you must unsubscribe manually' },
        ],
      },
      {
        prompt: 'Which operator is right for a type-ahead search that must cancel stale requests?',
        topic: 'Angular & RxJS',
        explanation:
          '`switchMap` unsubscribes from the previous inner observable when a new value arrives, so an older in-flight request cannot overwrite a newer result.',
        options: [
          { text: 'switchMap', correct: true },
          { text: 'mergeMap' },
          { text: 'concatMap' },
          { text: 'exhaustMap' },
        ],
      },
      {
        prompt: 'What is the purpose of `OnPush` change detection?',
        topic: 'Angular & RxJS',
        explanation:
          'It tells Angular to re-check the component only when an input reference changes, an event fires in it, or an observable it renders emits - cutting unnecessary checks.',
        options: [
          {
            text: 'Re-check the component only on input reference change, local events, or bound stream emissions',
            correct: true,
          },
          { text: 'Disable change detection entirely' },
          { text: 'Run change detection on every microtask' },
          { text: 'Render the component once and never update it' },
        ],
      },
    ],
  },
];

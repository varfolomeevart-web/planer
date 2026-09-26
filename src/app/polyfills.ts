/* Полифиллы для старых браузеров (Safari 11-14, Chrome 60-92, старые Android WebView).
 * Выполняются до рендера приложения. Все проверки защищены — в современных
 * браузерах файл не делает ничего. */

const g: any = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});

// globalThis (Chrome 71+, Safari 12.1+)
if (typeof (g as any).globalThis === 'undefined') {
  (g as any).globalThis = g;
}

// Object.hasOwn (Chrome 93+, Safari 15.4+)
if (typeof Object.hasOwn !== 'function') {
  (Object as any).hasOwn = function (obj: object, prop: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  };
}

// Object.fromEntries (Chrome 73+, Safari 12.1+)
if (typeof Object.fromEntries !== 'function') {
  (Object as any).fromEntries = function (entries: Iterable<[PropertyKey, unknown]>): object {
    const out: Record<PropertyKey, unknown> = {};
    for (const pair of Array.from(entries as Iterable<unknown>) as [PropertyKey, unknown][]) {
      out[pair[0]] = pair[1];
    }
    return out;
  };
}

// Array.prototype.at / String.prototype.at (Chrome 92+, Safari 15.4+)
function atPolyfill(this: any, n: number): unknown {
  n = Math.trunc(n) || 0;
  if (n < 0) n += this.length;
  if (n < 0 || n >= this.length) return undefined;
  return this[n];
}
if (!Array.prototype.at) {
  (Array.prototype as any).at = atPolyfill;
}
if (!String.prototype.at) {
  (String.prototype as any).at = atPolyfill;
}

// Array.prototype.findLast / findLastIndex (Chrome 97+, Safari 15.4+)
if (!Array.prototype.findLast) {
  Array.prototype.findLast = function <T>(this: T[], fn: (v: T, i: number, a: T[]) => unknown): T | undefined {
    for (let i = this.length - 1; i >= 0; i--) {
      if (fn(this[i], i, this)) return this[i];
    }
    return undefined;
  } as any;
}
if (!Array.prototype.findLastIndex) {
  Array.prototype.findLastIndex = function <T>(this: T[], fn: (v: T, i: number, a: T[]) => unknown): number {
    for (let i = this.length - 1; i >= 0; i--) {
      if (fn(this[i], i, this)) return i;
    }
    return -1;
  } as any;
}

// String.prototype.replaceAll (Chrome 85+, Safari 13.1+)
if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (this: string, search: string | RegExp, replace: string | ((s: string) => string)): string {
    if (search instanceof RegExp) {
      if (!search.global) {
        throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument');
      }
      return this.replace(search, replace as string);
    }
    return this.split(String(search)).join(String(replace));
  } as any;
}

// Promise.allSettled (Chrome 76+, Safari 13+)
if (typeof Promise.allSettled !== 'function') {
  (Promise as any).allSettled = function (promises: Iterable<unknown>): Promise<Array<{ status: string; value?: unknown; reason?: unknown }>> {
    const list = Array.from(promises as Iterable<Promise<unknown>>);
    return Promise.all(
      list.map((p) =>
        Promise.resolve(p).then(
          (value) => ({ status: 'fulfilled', value }),
          (reason) => ({ status: 'rejected', reason }),
        ),
      ),
    );
  };
}

// Array.prototype.flat / flatMap (Chrome 69+, Safari 12+)
function flatPolyfill(this: unknown[], depth?: number): unknown[] {
  const d = depth === undefined ? 1 : Math.trunc(depth) || 0;
  const out: unknown[] = [];
  const push = (arr: unknown[], level: number): void => {
    for (const item of arr) {
      if (Array.isArray(item) && level > 0) push(item, level - 1);
      else out.push(item);
    }
  };
  push(this, d);
  return out;
}
if (!Array.prototype.flat) {
  (Array.prototype as any).flat = flatPolyfill;
}
if (!Array.prototype.flatMap) {
  (Array.prototype as any).flatMap = function (this: unknown[], fn: (v: unknown, i: number, a: unknown[]) => unknown): unknown[] {
    return flatPolyfill.apply(this.map(fn) as unknown[], [1]);
  };
}

// String.prototype.trimStart / trimEnd (Chrome 66+, Safari 12+)
if (!String.prototype.trimStart) {
  String.prototype.trimStart = function (this: string): string {
    return this.replace(/^\s+/, '');
  } as any;
}
if (!String.prototype.trimEnd) {
  String.prototype.trimEnd = function (this: string): string {
    return this.replace(/\s+$/, '');
  } as any;
}

// Array.prototype.includes (Chrome 47+, Safari 9+ — на всякий случай)
if (!Array.prototype.includes) {
  Array.prototype.includes = function (this: unknown[], search: unknown): boolean {
    return this.indexOf(search) !== -1;
  } as any;
}

export {};

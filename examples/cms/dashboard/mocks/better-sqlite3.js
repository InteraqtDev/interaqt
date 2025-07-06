// Mock for better-sqlite3 module in browser environment
class MockStatement {
  constructor(sql) {
    this.sql = sql;
  }

  run(...params) {
    return { changes: 1, lastInsertRowid: 1 };
  }

  get(...params) {
    return {};
  }

  all(...params) {
    return [];
  }

  iterate(...params) {
    return [];
  }

  finalize() {
    // Mock implementation
  }
}

class MockDatabase {
  constructor(path, options = {}) {
    this.path = path;
    this.options = options;
    this.memory = options.memory || false;
  }

  prepare(sql) {
    return new MockStatement(sql);
  }

  exec(sql) {
    return this;
  }

  close() {
    // Mock implementation
  }

  transaction(fn) {
    return (...args) => {
      return fn(...args);
    };
  }

  pragma(name, value) {
    if (value !== undefined) {
      return this;
    }
    return '';
  }

  backup(destination, options = {}) {
    return Promise.resolve();
  }

  serialize(options = {}) {
    return new Uint8Array(0);
  }

  function(name, options, fn) {
    return this;
  }

  aggregate(name, options) {
    return this;
  }

  loadExtension(path, entryPoint) {
    return this;
  }

  defaultSafeIntegers(toggle) {
    return this;
  }

  unsafeMode(unsafe) {
    return this;
  }
}

export default function Database(path, options) {
  return new MockDatabase(path, options);
}

// Export named exports for compatibility
export { MockDatabase as Database }; 
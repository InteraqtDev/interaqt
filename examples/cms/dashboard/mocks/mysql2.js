// Mock for mysql2 module in browser environment

class MockConnection {
  constructor(config = {}) {
    this.config = config;
    this.connected = false;
  }

  connect(callback) {
    this.connected = true;
    if (callback) setTimeout(() => callback(null), 0);
  }

  query(sql, values, callback) {
    if (typeof values === 'function') {
      callback = values;
      values = [];
    }
    
    const result = {
      rows: [],
      fields: [],
      affectedRows: 0,
      insertId: 0,
      warningCount: 0,
      changedRows: 0
    };
    
    if (callback) {
      setTimeout(() => callback(null, result, []), 0);
    }
    return result;
  }

  execute(sql, values, callback) {
    return this.query(sql, values, callback);
  }

  end(callback) {
    this.connected = false;
    if (callback) setTimeout(() => callback(null), 0);
  }

  destroy() {
    this.connected = false;
  }

  on(event, callback) {
    return this;
  }

  removeListener(event, callback) {
    return this;
  }

  // Transaction methods
  beginTransaction(callback) {
    if (callback) setTimeout(() => callback(null), 0);
  }

  commit(callback) {
    if (callback) setTimeout(() => callback(null), 0);
  }

  rollback(callback) {
    if (callback) setTimeout(() => callback(null), 0);
  }

  // Prepared statements
  prepare(sql) {
    return {
      execute: (values, callback) => this.execute(sql, values, callback),
      close: (callback) => {
        if (callback) setTimeout(() => callback(null), 0);
      }
    };
  }
}

class MockPool {
  constructor(config = {}) {
    this.config = config;
    this.connectionLimit = config.connectionLimit || 10;
    this.acquireTimeout = config.acquireTimeout || 60000;
    this.timeout = config.timeout || 60000;
  }

  getConnection(callback) {
    const connection = new MockConnection(this.config);
    connection.release = () => {};
    if (callback) setTimeout(() => callback(null, connection), 0);
  }

  query(sql, values, callback) {
    if (typeof values === 'function') {
      callback = values;
      values = [];
    }
    
    const result = {
      rows: [],
      fields: [],
      affectedRows: 0,
      insertId: 0,
      warningCount: 0,
      changedRows: 0
    };
    
    if (callback) {
      setTimeout(() => callback(null, result, []), 0);
    }
    return result;
  }

  execute(sql, values, callback) {
    return this.query(sql, values, callback);
  }

  end(callback) {
    if (callback) setTimeout(() => callback(null), 0);
  }

  on(event, callback) {
    return this;
  }

  removeListener(event, callback) {
    return this;
  }
}

// Promise versions
class MockPromiseConnection {
  constructor(config = {}) {
    this.config = config;
    this.connected = false;
  }

  async connect() {
    this.connected = true;
  }

  async query(sql, values = []) {
    return {
      rows: [],
      fields: [],
      affectedRows: 0,
      insertId: 0,
      warningCount: 0,
      changedRows: 0
    };
  }

  async execute(sql, values = []) {
    return this.query(sql, values);
  }

  async end() {
    this.connected = false;
  }

  destroy() {
    this.connected = false;
  }

  on(event, callback) {
    return this;
  }

  removeListener(event, callback) {
    return this;
  }

  async beginTransaction() {
    return;
  }

  async commit() {
    return;
  }

  async rollback() {
    return;
  }

  prepare(sql) {
    return {
      execute: async (values = []) => this.execute(sql, values),
      close: async () => {}
    };
  }
}

class MockPromisePool {
  constructor(config = {}) {
    this.config = config;
    this.connectionLimit = config.connectionLimit || 10;
  }

  async getConnection() {
    const connection = new MockPromiseConnection(this.config);
    connection.release = () => {};
    return connection;
  }

  async query(sql, values = []) {
    return {
      rows: [],
      fields: [],
      affectedRows: 0,
      insertId: 0,
      warningCount: 0,
      changedRows: 0
    };
  }

  async execute(sql, values = []) {
    return this.query(sql, values);
  }

  async end() {
    return;
  }

  on(event, callback) {
    return this;
  }

  removeListener(event, callback) {
    return this;
  }
}

// Factory functions
function createConnection(config) {
  return new MockConnection(config);
}

function createPool(config) {
  return new MockPool(config);
}

// Promise factory functions
const promise = {
  createConnection: (config) => new MockPromiseConnection(config),
  createPool: (config) => new MockPromisePool(config)
};

// Export everything
export { MockConnection as Connection };
export { MockPool as Pool };
export { createConnection };
export { createPool };
export { promise };

// Default export
export default {
  Connection: MockConnection,
  Pool: MockPool,
  createConnection,
  createPool,
  promise
}; 
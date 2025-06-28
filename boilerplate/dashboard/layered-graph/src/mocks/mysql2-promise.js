// Mock for mysql2/promise module in browser environment

class MockPromiseConnection {
  constructor(config = {}) {
    this.config = config;
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    return this;
  }

  async query(sql, values = []) {
    return [
      [], // rows
      []  // fields
    ];
  }

  async execute(sql, values = []) {
    return [
      {
        affectedRows: 0,
        insertId: 0,
        warningCount: 0,
        changedRows: 0
      },
      [] // fields
    ];
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

  // Transaction methods
  async beginTransaction() {
    return;
  }

  async commit() {
    return;
  }

  async rollback() {
    return;
  }

  // Prepared statements
  prepare(sql) {
    return {
      execute: async (values = []) => this.execute(sql, values),
      close: async () => {}
    };
  }

  // Connection release (for pool connections)
  release() {
    // Mock implementation
  }

  // Change user
  async changeUser(options) {
    return;
  }

  // Ping
  async ping() {
    return;
  }

  // Statistics
  async statistics() {
    return '';
  }
}

class MockPromisePool {
  constructor(config = {}) {
    this.config = config;
    this.connectionLimit = config.connectionLimit || 10;
    this.acquireTimeout = config.acquireTimeout || 60000;
    this.timeout = config.timeout || 60000;
  }

  async getConnection() {
    const connection = new MockPromiseConnection(this.config);
    connection.release = () => {};
    return connection;
  }

  async query(sql, values = []) {
    return [
      [], // rows
      []  // fields
    ];
  }

  async execute(sql, values = []) {
    return [
      {
        affectedRows: 0,
        insertId: 0,
        warningCount: 0,
        changedRows: 0
      },
      [] // fields
    ];
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

  // Pool-specific methods
  async format(sql, values) {
    return sql;
  }

  escape(value) {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    return value;
  }

  escapeId(identifier) {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
}

// Factory functions
async function createConnection(config) {
  const connection = new MockPromiseConnection(config);
  await connection.connect();
  return connection;
}

function createPool(config) {
  return new MockPromisePool(config);
}

// Pool cluster (for load balancing)
class MockPromisePoolCluster {
  constructor(config = {}) {
    this.config = config;
  }

  add(id, config) {
    // Mock implementation
  }

  remove(pattern) {
    // Mock implementation
  }

  async getConnection(pattern, selector) {
    return new MockPromiseConnection(this.config);
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

  of(pattern, selector) {
    return new MockPromisePool(this.config);
  }
}

function createPoolCluster(config) {
  return new MockPromisePoolCluster(config);
}

// Export classes and functions
export { MockPromiseConnection as Connection };
export { MockPromisePool as Pool };
export { MockPromisePoolCluster as PoolCluster };
export { createConnection };
export { createPool };
export { createPoolCluster };

// Default export
export default {
  Connection: MockPromiseConnection,
  Pool: MockPromisePool,
  PoolCluster: MockPromisePoolCluster,
  createConnection,
  createPool,
  createPoolCluster
}; 
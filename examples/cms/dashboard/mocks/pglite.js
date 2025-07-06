// Mock for @electric-sql/pglite module in browser environment

class MockPGlite {
  constructor(dataDir, options = {}) {
    this.dataDir = dataDir;
    this.options = options;
    this.ready = Promise.resolve();
    this._closed = false;
  }

  async query(sql, params = []) {
    // Mock query response
    return {
      rows: [],
      fields: [],
      affectedRows: 0,
      command: 'SELECT'
    };
  }

  async exec(sql) {
    // Mock exec response
    return [
      {
        rows: [],
        fields: [],
        affectedRows: 0,
        command: 'CREATE'
      }
    ];
  }

  async transaction(callback) {
    // Mock transaction
    const tx = {
      query: this.query.bind(this),
      exec: this.exec.bind(this)
    };
    return await callback(tx);
  }

  async close() {
    this._closed = true;
  }

  get closed() {
    return this._closed;
  }

  // Mock extensions support
  async loadExtension(name) {
    return;
  }

  // Mock dump/restore
  async dumpDataDir() {
    return new Uint8Array(0);
  }

  async execProtocol(message) {
    return [];
  }

  // Mock listen/notify
  async listen(channel, callback) {
    return () => {}; // unsubscribe function
  }

  async notify(channel, payload) {
    return;
  }

  // Mock prepared statements
  prepare(sql) {
    return {
      query: async (params = []) => this.query(sql, params),
      exec: async (params = []) => this.exec(sql),
      finalize: async () => {}
    };
  }
}

// Export the main class
export { MockPGlite as PGlite };

// Default export for compatibility
export default MockPGlite; 
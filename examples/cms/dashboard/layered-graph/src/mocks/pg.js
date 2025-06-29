// Mock for pg module in browser environment

class MockClient {
  constructor(config = {}) {
    this.config = config;
    this.connected = false;
  }

  async connect() {
    this.connected = true;
  }

  async query(text, values = []) {
    return {
      rows: [],
      fields: [],
      rowCount: 0,
      command: 'SELECT',
      oid: null
    };
  }

  async end() {
    this.connected = false;
  }

  release() {
    // For pool clients
  }

  on(event, callback) {
    // Mock event handling
    return this;
  }

  removeListener(event, callback) {
    return this;
  }
}

class MockPool {
  constructor(config = {}) {
    this.config = config;
    this.totalCount = 0;
    this.idleCount = 0;
    this.waitingCount = 0;
  }

  async connect() {
    const client = new MockClient(this.config);
    client.release = () => {};
    return client;
  }

  async query(text, values = []) {
    return {
      rows: [],
      fields: [],
      rowCount: 0,
      command: 'SELECT',
      oid: null
    };
  }

  async end() {
    // Close all connections
  }

  on(event, callback) {
    return this;
  }

  removeListener(event, callback) {
    return this;
  }
}

// Mock types
const types = {
  setTypeParser: (oid, parser) => {},
  getTypeParser: (oid) => (val) => val,
  builtins: {
    BOOL: 16,
    BYTEA: 17,
    CHAR: 18,
    INT8: 20,
    INT2: 21,
    INT4: 23,
    REGPROC: 24,
    TEXT: 25,
    OID: 26,
    TID: 27,
    XID: 28,
    CID: 29,
    JSON: 114,
    XML: 142,
    PGNODETREE: 194,
    POINT: 600,
    LSEG: 601,
    PATH: 602,
    BOX: 603,
    POLYGON: 604,
    LINE: 628,
    CIDR: 650,
    FLOAT4: 700,
    FLOAT8: 701,
    ABSTIME: 702,
    RELTIME: 703,
    TINTERVAL: 704,
    UNKNOWN: 705,
    CIRCLE: 718,
    MACADDR8: 774,
    MONEY: 790,
    MACADDR: 829,
    INET: 869,
    ACLITEM: 1033,
    BPCHAR: 1042,
    VARCHAR: 1043,
    DATE: 1082,
    TIME: 1083,
    TIMESTAMP: 1114,
    TIMESTAMPTZ: 1184,
    INTERVAL: 1186,
    TIMETZ: 1266,
    BIT: 1560,
    VARBIT: 1562,
    NUMERIC: 1700,
    REFCURSOR: 1790,
    REGPROCEDURE: 2202,
    REGOPER: 2203,
    REGOPERATOR: 2204,
    REGCLASS: 2205,
    REGTYPE: 2206,
    UUID: 2950,
    TXID_SNAPSHOT: 2970,
    PG_LSN: 3220,
    PG_NDISTINCT: 3361,
    PG_DEPENDENCIES: 3402,
    TSVECTOR: 3614,
    TSQUERY: 3615,
    GTSVECTOR: 3642,
    REGCONFIG: 3734,
    REGDICTIONARY: 3769,
    JSONB: 3802,
    REGNAMESPACE: 4089,
    REGROLE: 4096
  }
};

// Export classes and utilities
export { MockClient as Client };
export { MockPool as Pool };
export { types };

// Default export
export default {
  Client: MockClient,
  Pool: MockPool,
  types
}; 
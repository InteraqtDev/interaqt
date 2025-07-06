// Mock for async_hooks module in browser environment
export class AsyncLocalStorage {
  constructor() {
    this.store = new Map();
  }

  run(store, callback, ...args) {
    const previousStore = this.store;
    this.store = new Map(store);
    try {
      return callback(...args);
    } finally {
      this.store = previousStore;
    }
  }

  getStore() {
    return this.store;
  }

  enterWith(store) {
    this.store = new Map(store);
  }

  disable() {
    this.store = new Map();
  }
}

export default {
  AsyncLocalStorage
}; 
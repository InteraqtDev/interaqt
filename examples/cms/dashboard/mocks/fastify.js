// Mock for fastify module in browser environment

class MockFastifyInstance {
  constructor(options = {}) {
    this.options = options;
    this.routes = new Map();
    this.hooks = new Map();
    this.decorators = new Map();
    this.plugins = [];
    this.schemas = new Map();
    this.contextConfig = {};
    this.server = null;
    this.listeningPort = null;
  }

  // HTTP Methods
  get(url, options, handler) {
    if (typeof options === 'function') {
      handler = options;
      options = {};
    }
    this.routes.set(`GET:${url}`, { options, handler });
    return this;
  }

  post(url, options, handler) {
    if (typeof options === 'function') {
      handler = options;
      options = {};
    }
    this.routes.set(`POST:${url}`, { options, handler });
    return this;
  }

  put(url, options, handler) {
    if (typeof options === 'function') {
      handler = options;
      options = {};
    }
    this.routes.set(`PUT:${url}`, { options, handler });
    return this;
  }

  delete(url, options, handler) {
    if (typeof options === 'function') {
      handler = options;
      options = {};
    }
    this.routes.set(`DELETE:${url}`, { options, handler });
    return this;
  }

  patch(url, options, handler) {
    if (typeof options === 'function') {
      handler = options;
      options = {};
    }
    this.routes.set(`PATCH:${url}`, { options, handler });
    return this;
  }

  head(url, options, handler) {
    if (typeof options === 'function') {
      handler = options;
      options = {};
    }
    this.routes.set(`HEAD:${url}`, { options, handler });
    return this;
  }

  options(url, options, handler) {
    if (typeof options === 'function') {
      handler = options;
      options = {};
    }
    this.routes.set(`OPTIONS:${url}`, { options, handler });
    return this;
  }

  // Route registration
  route(options) {
    const method = options.method || 'GET';
    const url = options.url || '/';
    this.routes.set(`${method.toUpperCase()}:${url}`, options);
    return this;
  }

  // Plugin registration
  async register(plugin, options = {}) {
    this.plugins.push({ plugin, options });
    if (typeof plugin === 'function') {
      await plugin(this, options);
    }
    return this;
  }

  // Decorators
  decorate(name, value) {
    this.decorators.set(name, value);
    this[name] = value;
    return this;
  }

  decorateRequest(name, value) {
    // Mock implementation
    return this;
  }

  decorateReply(name, value) {
    // Mock implementation
    return this;
  }

  // Hooks
  addHook(name, fn) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name).push(fn);
    return this;
  }

  // Schema management
  addSchema(schema) {
    const id = schema.$id || schema.id;
    if (id) {
      this.schemas.set(id, schema);
    }
    return this;
  }

  getSchema(id) {
    return this.schemas.get(id);
  }

  getSchemas() {
    return Object.fromEntries(this.schemas);
  }

  // Server lifecycle
  async listen(options = {}) {
    let port, host;
    
    if (typeof options === 'number') {
      port = options;
      host = '127.0.0.1';
    } else if (typeof options === 'string') {
      const parts = options.split(':');
      host = parts[0] || '127.0.0.1';
      port = parseInt(parts[1]) || 3000;
    } else {
      port = options.port || 3000;
      host = options.host || '127.0.0.1';
    }

    this.listeningPort = port;
    console.log(`Mock Fastify server listening on ${host}:${port}`);
    return `${host}:${port}`;
  }

  async close() {
    this.listeningPort = null;
    console.log('Mock Fastify server closed');
  }

  async ready() {
    return this;
  }

  // Error handling
  setErrorHandler(handler) {
    this.errorHandler = handler;
    return this;
  }

  setNotFoundHandler(handler) {
    this.notFoundHandler = handler;
    return this;
  }

  // Context configuration
  setValidatorCompiler(compiler) {
    this.validatorCompiler = compiler;
    return this;
  }

  setSerializerCompiler(compiler) {
    this.serializerCompiler = compiler;
    return this;
  }

  setSchemaController(controller) {
    this.schemaController = controller;
    return this;
  }

  // Logging
  get log() {
    return {
      info: (...args) => console.log('[INFO]', ...args),
      warn: (...args) => console.warn('[WARN]', ...args),
      error: (...args) => console.error('[ERROR]', ...args),
      debug: (...args) => console.debug('[DEBUG]', ...args),
      trace: (...args) => console.trace('[TRACE]', ...args),
      fatal: (...args) => console.error('[FATAL]', ...args),
      child: () => this.log
    };
  }

  // Request injection (for testing)
  async inject(options) {
    return {
      statusCode: 200,
      headers: {},
      payload: '{}',
      body: '{}',
      json: () => ({}),
      cookies: []
    };
  }

  // Print routes
  printRoutes() {
    console.log('Registered routes:');
    for (const [key, route] of this.routes) {
      console.log(`  ${key}`);
    }
  }

  // Print plugins
  printPlugins() {
    console.log('Registered plugins:');
    this.plugins.forEach((plugin, index) => {
      console.log(`  ${index + 1}. ${plugin.plugin.name || 'Anonymous'}`);
    });
  }

  // Prefix support
  register(plugin, options = {}) {
    if (options.prefix) {
      // Handle prefix in mock
    }
    return super.register(plugin, options);
  }
}

// Fastify factory function
function fastify(options = {}) {
  return new MockFastifyInstance(options);
}

// Static methods
fastify.fastify = fastify;

// Export default
export default fastify; 
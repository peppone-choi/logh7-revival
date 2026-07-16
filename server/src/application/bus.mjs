// CQRS 버스 — 커맨드(쓰기) / 쿼리(읽기) 분리

/**
 * @typedef {{ type: string, [key: string]: any }} Message
 */

export function createCommandBus() {
  /** @type {Map<string, Function>} */
  const handlers = new Map();

  return {
    register(type, handler) {
      if (handlers.has(type)) throw new Error(`command handler already registered: ${type}`);
      handlers.set(type, handler);
    },
    /**
     * @param {Message} command
     * @param {{ uow?: object }} [ctx]
     */
    execute(command, ctx = {}) {
      const handler = handlers.get(command.type);
      if (!handler) throw new Error(`no command handler for ${command.type}`);
      return handler(command, ctx);
    },
    listTypes: () => [...handlers.keys()],
  };
}

export function createQueryBus() {
  /** @type {Map<string, Function>} */
  const handlers = new Map();

  return {
    register(type, handler) {
      if (handlers.has(type)) throw new Error(`query handler already registered: ${type}`);
      handlers.set(type, handler);
    },
    async execute(query, ctx = {}) {
      const handler = handlers.get(query.type);
      if (!handler) throw new Error(`no query handler for ${query.type}`);
      return handler(query, ctx);
    },
    listTypes: () => [...handlers.keys()],
  };
}

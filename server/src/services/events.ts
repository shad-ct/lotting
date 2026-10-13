import { EventEmitter } from 'node:events';

/**
 * Internal pub/sub bus: services publish domain events, the Socket.IO layer
 * (and tests) subscribe. Keeps services free of socket imports.
 */
export type DomainEvent =
  | { type: 'draw:new'; gameId: string; seq: number; number: number; drawCount: number; source: string }
  | { type: 'draw:undone'; gameId: string; seq: number; number: number; drawCount: number }
  | { type: 'admin:snapshot'; gameId: string }
  | { type: 'me:update'; gameId: string }
  | { type: 'win:detected'; gameId: string; events: unknown }
  | { type: 'win:confirmed'; gameId: string; events: unknown }
  | { type: 'game:status'; gameId: string; status: string };

class Bus extends EventEmitter {}

export const bus = new Bus();
bus.setMaxListeners(50);

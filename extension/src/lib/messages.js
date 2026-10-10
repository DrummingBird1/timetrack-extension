// The popup / dashboard / block page talk to the service worker through
// chrome.runtime.sendMessage. This file is the single source of truth for that
// protocol: MessageMap types both ends (checked by `tsc`), sendMessage() is the one
// way to send, and parseMessage() is the one gate the worker validates through.

/**
 * @typedef {object} LiveView
 * @property {boolean} enabled
 * @property {boolean} counting
 * @property {string | null} currentDomain
 * @property {number} liveSeconds
 * @property {{ domains: Record<string, { t: number, v: number, dh?: Record<string, number> }>, hours: number[] }} today
 *
 * @typedef {object} FocusView
 * @property {boolean} active
 * @property {'work' | 'break'} phase
 * @property {number} endsAt
 * @property {number} remaining
 * @property {number} cycle
 * @property {number} totalCycles
 * @property {boolean} strict
 * @property {number} pausedUntil
 * @property {boolean} [refused]
 *
 * @typedef {object} BackupResult
 * @property {boolean} ran
 * @property {boolean} [ok]
 * @property {string} status
 *
 * @typedef {{
 *   getLive:         { req: {}, res: LiveView },
 *   setEnabled:      { req: { value: boolean }, res: { enabled: boolean } },
 *   settingsChanged: { req: {}, res: { ok: boolean } },
 *   flush:           { req: {}, res: { ok: boolean } },
 *   runBackup:       { req: {}, res: BackupResult },
 *   prune:           { req: {}, res: { removed: number } },
 *   getFocus:        { req: {}, res: FocusView },
 *   startFocus:      { req: { minutes?: number }, res: FocusView },
 *   stopFocus:       { req: {}, res: { active: boolean, refused?: boolean } },
 *   snoozeFocus:     { req: { minutes?: number }, res: FocusView },
 * }} MessageMap
 */

/** @type {Array<keyof MessageMap>} */
export const MESSAGE_TYPES = [
  'getLive', 'setEnabled', 'settingsChanged', 'flush', 'runBackup', 'prune', 'getFocus', 'startFocus', 'stopFocus', 'snoozeFocus',
];

/**
 * Send a typed request to the service worker. Never rejects: if the worker is
 * unreachable the caller gets `{}` (the UI renders an empty state instead of crashing).
 * @template {keyof MessageMap} T
 * @param {T} type
 * @param {MessageMap[T]['req']} [extra]
 * @returns {Promise<MessageMap[T]['res']>}
 */
export function sendMessage(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra }).catch(() => ({}));
}

/**
 * Validate and normalize an incoming message. Returns null for anything that is not a
 * known request, so the worker never acts on malformed input.
 * @param {unknown} raw
 * @returns {({ type: keyof MessageMap } & Record<string, any>) | null}
 */
export function parseMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const msg = /** @type {Record<string, any>} */ (raw);
  if (!MESSAGE_TYPES.includes(msg.type)) return null;
  switch (msg.type) {
    case 'setEnabled':
      return { type: 'setEnabled', value: !!msg.value };
    case 'startFocus':
    case 'snoozeFocus': {
      const minutes = Number(msg.minutes);
      return { type: msg.type, minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined };
    }
    default:
      return { type: msg.type };
  }
}

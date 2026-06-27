export function makeLogger(ctx = {}) {
  const fmt = (level, msg, extra = {}) =>
    JSON.stringify({ ts: Date.now(), level, ...ctx, msg, ...extra });
  return {
    info:  (msg, extra) => console.log(fmt('info', msg, extra)),
    warn:  (msg, extra) => console.warn(fmt('warn', msg, extra)),
    error: (msg, extra) => console.error(fmt('error', msg, extra)),
  };
}
export const log = makeLogger();

// Envuelve handlers/middlewares async de Express para que un
// promise rejection no crashee el proceso (Express 4 no los
// captura automáticamente) — los reenvía a next(err).
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

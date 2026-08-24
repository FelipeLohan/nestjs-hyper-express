/**
 * hyper-express route/not-found/error handlers never invoke `next`
 * themselves — only middlewares do. Nest always registers callbacks shaped
 * `(..., next) => any`, so this stands in for the `next` hyper-express will
 * never call.
 */
export function noopNext(): void {}

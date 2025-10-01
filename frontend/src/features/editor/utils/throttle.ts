// utils/throttle.ts (or near the top of the file)
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
): (...args: A) => void {
  let last = 0;
  let timer: number | null = null;

  return function (this: unknown, ...args: A) {
    const now = Date.now();
    const run = () => {
      last = now;
      timer = null;
      fn.apply(this, args);
    };
    if (now - last >= ms) run();
    else if (timer == null) timer = window.setTimeout(run, ms - (now - last));
  };
}

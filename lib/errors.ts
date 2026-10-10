// An error that knows the HTTP answer it is: route() (lib/route.ts) answers it
// as { error } with its status, so handlers needn't catch it. Imports nothing,
// so any module (and the tests) can throw one.

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

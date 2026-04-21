export class SpriteError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SpriteError";
    this.code = code;
  }
}

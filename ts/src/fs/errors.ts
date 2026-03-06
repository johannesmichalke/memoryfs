export class NotFoundError extends Error {
  constructor(path: string) {
    super(`No such file or directory: ${path}`);
    this.name = "NotFoundError";
  }
}

export class IsDirectoryError extends Error {
  constructor(path: string) {
    super(`Is a directory: ${path}`);
    this.name = "IsDirectoryError";
  }
}

export class NotDirectoryError extends Error {
  constructor(path: string) {
    super(`Not a directory: ${path}`);
    this.name = "NotDirectoryError";
  }
}

export class EditConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditConflictError";
  }
}

export class FileSizeError extends Error {
  constructor(size: number, limit: number) {
    super(`File size ${size} bytes exceeds limit of ${limit} bytes`);
    this.name = "FileSizeError";
  }
}

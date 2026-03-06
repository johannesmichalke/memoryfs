class NotFoundError(FileNotFoundError):
    def __init__(self, path: str):
        super().__init__(f"No such file or directory: {path}")


class IsDirectoryError(IsADirectoryError):
    def __init__(self, path: str):
        super().__init__(f"Is a directory: {path}")


class NotDirectoryError(NotADirectoryError):
    def __init__(self, path: str):
        super().__init__(f"Not a directory: {path}")


class EditConflictError(Exception):
    def __init__(self, message: str):
        super().__init__(message)


class FileSizeError(ValueError):
    def __init__(self, size: int, limit: int):
        super().__init__(f"File size {size} bytes exceeds limit of {limit} bytes")

import posixpath


def normalize(p: str) -> str:
    if not p or p == "/":
        return "/"
    # Ensure leading slash, resolve . and .., remove trailing slash
    if not p.startswith("/"):
        p = "/" + p
    resolved = posixpath.normpath(p)
    return resolved if resolved else "/"


def parent_path(p: str) -> str:
    norm = normalize(p)
    if norm == "/":
        return "/"
    parent = posixpath.dirname(norm)
    return parent if parent else "/"


def base_name(p: str) -> str:
    norm = normalize(p)
    if norm == "/":
        return "/"
    return posixpath.basename(norm)


def all_ancestors(p: str) -> list[str]:
    ancestors: list[str] = []
    current = parent_path(p)
    while current != "/" and current not in ancestors:
        ancestors.append(current)
        current = parent_path(current)
    if "/" not in ancestors:
        ancestors.append("/")
    return list(reversed(ancestors))


def glob_to_like(pattern: str) -> str:
    like = pattern
    like = like.replace("%", "\\%")
    like = like.replace("_", "\\_")
    like = like.replace("**", "\x00")  # placeholder for **
    like = like.replace("*", "%")
    like = like.replace("?", "_")
    like = like.replace("\x00", "%")  # ** also becomes %
    return like


def is_child_path(child: str, parent: str) -> bool:
    norm_child = normalize(child)
    norm_parent = normalize(parent)
    if norm_parent == "/":
        return True
    return norm_child.startswith(norm_parent + "/") or norm_child == norm_parent

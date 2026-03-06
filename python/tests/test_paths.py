from agent_vfs.paths import normalize, parent_path, base_name, all_ancestors, glob_to_like, is_child_path


class TestNormalize:
    def test_root(self):
        assert normalize("/") == "/"

    def test_empty(self):
        assert normalize("") == "/"

    def test_trailing_slash(self):
        assert normalize("/foo/") == "/foo"

    def test_double_slash(self):
        assert normalize("/foo//bar") == "/foo/bar"

    def test_dot(self):
        assert normalize("/foo/./bar") == "/foo/bar"

    def test_dotdot(self):
        assert normalize("/foo/bar/../baz") == "/foo/baz"

    def test_no_leading_slash(self):
        assert normalize("foo/bar") == "/foo/bar"


class TestParentPath:
    def test_root(self):
        assert parent_path("/") == "/"

    def test_top_level(self):
        assert parent_path("/foo") == "/"

    def test_nested(self):
        assert parent_path("/foo/bar") == "/foo"


class TestBaseName:
    def test_root(self):
        assert base_name("/") == "/"

    def test_file(self):
        assert base_name("/foo/bar.txt") == "bar.txt"


class TestAllAncestors:
    def test_nested(self):
        assert all_ancestors("/a/b/c") == ["/", "/a", "/a/b"]


class TestGlobToLike:
    def test_star(self):
        assert glob_to_like("*.md") == "%.md"

    def test_question(self):
        assert glob_to_like("file?.txt") == "file_.txt"

    def test_double_star(self):
        assert glob_to_like("**/*.ts") == "%/%.ts"


class TestIsChildPath:
    def test_root_parent(self):
        assert is_child_path("/foo", "/") is True

    def test_direct_child(self):
        assert is_child_path("/foo/bar", "/foo") is True

    def test_not_child(self):
        assert is_child_path("/baz", "/foo") is False

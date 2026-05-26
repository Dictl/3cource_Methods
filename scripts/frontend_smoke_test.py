import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TEMPLATE_PATH = os.path.join(BASE_DIR, "templates", "home.html")
LOGIN_TEMPLATE_PATH = os.path.join(BASE_DIR, "templates", "login.html")
REGISTER_TEMPLATE_PATH = os.path.join(BASE_DIR, "templates", "register.html")
JS_PATH = os.path.join(BASE_DIR, "core", "static", "js", "home.js")
CSS_PATH = os.path.join(BASE_DIR, "core", "static", "css", "home.css")

REQUIRED_IDS = [
    "treeContainer",
    "contentContainer",
    "tab-content",
    "tab-params",
    "tab-enums",
    "tab-product",
    "tab-search",
    "param_name",
    "enum_description",
    "productDetails",
    "searchFilters",
]


def main():
    missing = []
    for path in (TEMPLATE_PATH, LOGIN_TEMPLATE_PATH, REGISTER_TEMPLATE_PATH, JS_PATH, CSS_PATH):
        if not os.path.exists(path):
            missing.append(path)
    if missing:
        print("Missing files:")
        for path in missing:
            print("-", path)
        return 1

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as handle:
        html = handle.read()

    missing_ids = [ident for ident in REQUIRED_IDS if f'id="{ident}"' not in html]
    if missing_ids:
        print("Missing required IDs in home.html:")
        for ident in missing_ids:
            print("-", ident)
        return 2

    print("Frontend smoke test passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())


from __future__ import annotations

import os
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TARGETS = (
    (ROOT / "assets" / "flags", 160, 110),
    (ROOT / "assets" / "shirts", 160, 160),
)


def optimize_image(path: Path, max_width: int, max_height: int) -> tuple[bool, int, int]:
    original_size = path.stat().st_size
    with Image.open(path) as image:
        image.load()
        image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)

        tmp_path = path.with_suffix(path.suffix + ".tmp")
        save_kwargs = {"optimize": True}
        if path.suffix.lower() == ".png":
            save_kwargs["compress_level"] = 9

        image.save(tmp_path, format="PNG", **save_kwargs)

    optimized_size = tmp_path.stat().st_size
    if optimized_size < original_size:
        os.replace(tmp_path, path)
        return True, original_size, optimized_size

    tmp_path.unlink(missing_ok=True)
    return False, original_size, original_size


def main() -> None:
    changed = 0
    saved = 0
    for directory, max_width, max_height in TARGETS:
        for path in sorted(directory.glob("*.png")):
            did_change, before, after = optimize_image(path, max_width, max_height)
            if did_change:
                changed += 1
                saved += before - after

    print(f"Optimized {changed} images, saved {saved / 1024:.1f} KB.")


if __name__ == "__main__":
    main()

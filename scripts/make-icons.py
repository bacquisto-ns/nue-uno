"""Render the PWA icons (PRD N1) from the favicon design: two tilted cards and a white oval "N".

    python scripts/make-icons.py

Writes apps/web/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png. Drawn with
Pillow at 4x and downsampled, so there's no SVG rasterizer dependency.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "apps" / "web" / "public" / "icons"
NAVY = (11, 26, 43, 255)
GOLD = (245, 180, 0, 255)
RED = (229, 72, 77, 255)
WHITE = (255, 255, 255, 255)


def card(size: int, fill, outline=None, angle: float = 0) -> Image.Image:
    """A 36x52 (of 64) rounded card centred on a transparent square, rotated by `angle`."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    u = size / 64
    box = (14 * u, 6 * u, 50 * u, 58 * u)
    d.rounded_rectangle(box, radius=7 * u, fill=fill, outline=outline, width=int(3 * u) if outline else 0)
    return layer.rotate(-angle, resample=Image.BICUBIC, center=(size / 2, size / 2))


def emblem(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(card(size, NAVY, GOLD, 12))
    img.alpha_composite(card(size, RED, None, -8))
    u = size / 64
    oval = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(oval).ellipse((20 * u, 13 * u, 44 * u, 51 * u), fill=WHITE)
    img.alpha_composite(oval.rotate(30, resample=Image.BICUBIC, center=(size / 2, size / 2)))
    try:
        font = ImageFont.truetype("ariblk.ttf", int(22 * u))
    except OSError:
        font = ImageFont.truetype("arialbd.ttf", int(22 * u))
    ImageDraw.Draw(img).text((32 * u, 32 * u), "N", font=font, fill=RED, anchor="mm")
    return img


def render(px: int, pad: float, bg=NAVY, rounded: bool = False) -> Image.Image:
    """Emblem scaled into (1 - 2*pad) of a px square on a solid background."""
    big = px * 4
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    bgl = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(bgl).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22) if rounded else 0, fill=bg)
    canvas.alpha_composite(bgl)
    inner = int(big * (1 - 2 * pad))
    e = emblem(inner)
    canvas.alpha_composite(e, (int(big * pad), int(big * pad)))
    return canvas.resize((px, px), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render(192, 0.06, rounded=True).save(OUT / "icon-192.png")
    render(512, 0.06, rounded=True).save(OUT / "icon-512.png")
    # Maskable: full-bleed background, emblem inside the 80% safe zone.
    render(512, 0.16).save(OUT / "maskable-512.png")
    # iOS adds its own rounding and ignores transparency.
    render(180, 0.1).convert("RGB").save(OUT / "apple-touch-icon.png")
    print(f"Wrote icons to {OUT}")


if __name__ == "__main__":
    main()

"""Rebuild the web fonts in apps/web/src/styles/fonts from their sources.

Allo (allo-font on npm, OFL): subset to Latin, punctuation, arrows and maths, roundness pinned at 40 (crisper than
Allo's 50, half the file), optical size and weight kept variable. Paper Mono (OFL): subset the variable webfont.

  pip install fonttools brotli
  python3 scripts/fonts.py <AlloVariable.woff2> <PaperMono[wght].woff2>
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = "apps/web/src/styles/fonts/"
TEXT = "U+0000-024F,U+02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-218F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+25A0-25FF,U+2713,U+2715,U+FEFF,U+FFFD"
CODE = "U+0000-024F,U+2000-206F,U+2190-21FF,U+2200-22FF,U+2500-257F,U+25A0-25FF,U+FFFD"


def cut(path: str, unicodes: str) -> TTFont:
    font = TTFont(path)
    opts = subset.Options()
    opts.layout_features = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(unicodes))
    sub.subset(font)
    return font


allo = instancer.instantiateVariableFont(cut(sys.argv[1], TEXT), {"ROND": 40})
allo.flavor = "woff2"
allo.save(OUT + "Allo.woff2")
mono = cut(sys.argv[2], CODE)
mono.flavor = "woff2"
mono.save(OUT + "PaperMono.woff2")

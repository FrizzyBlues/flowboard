## Variant: V2.1 — Collapsed Calibration + Stable Grid

V2+V3 hybrid with two changes:
1. Calibration is **collapsed by default** — a full-width toggle bar at the card footer opens it.
2. **Zero grid reflow** — cards are a fixed 300px tall; the calibration panel is `position: absolute`
   and floats OVER the cards below (raised z-index) instead of participating in grid layout.
   Expanding calibration on any card never resizes, shifts, or reflows any other card.

Interactive: open/close vents, toggle calibration, SAVE feedback, ARM BULK gate.

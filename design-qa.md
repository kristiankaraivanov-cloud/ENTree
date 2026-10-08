# ENTree visual and interaction QA

final result: passed

## Evidence

- Source: user-provided Disk Explorer reference, 1672 × 941 pixels.
- Final native desktop capture: `docs/showcase.png`, 1672 × 943 pixels, scale factor 1. Source height normalized by two pixels for the combined comparison.
- Source and final capture were opened together in a vertical comparison. The toolbar, tables, selected row, treemap labels, status footer and settings were inspected at readable size.
- `docs/settings.png` and `docs/forest-dark.png` show the requested customization controls and personal theme.

## Findings and fixes

- [Resolved P1] Treemap tiles initially had no color because CSS custom properties were assigned as ordinary object properties. Set them through `style.setProperty`; native capture confirms the blue, amber, purple, teal, coral and gray palette.
- [Resolved P2] Narrow folder labels were clipped. Use compact labels, adequate label heights and a squarified layout. Final capture shows Projects, Other, Downloads, Images, cache and Documents without cut text.
- [Resolved P2] Browser capture did not preserve the target dimensions on this desktop. Verified the actual Electron window and captured at scale factor 1; final image dimensions are confirmed.
- No outstanding P0/P1/P2 findings.

## Fidelity surfaces

- Typography: Segoe UI/system UI; dense table rows, small headers, bold tile names and capacity figures follow the reference. Interface scale is adjustable.
- Layout: desktop title controls, drive/scan/refresh/search/capacity toolbar, tabs, 64.5/35.5 table split, lower treemap and bottom status/zoom controls are present. The Settings and review controls are requested ENTree additions.
- Colors: light gray chrome, white tables, blue actions and selected rows, yellow folders, type-color swatches and saturated treemap categories match the reference language. A forest theme and adjustable accents are available.
- Assets: MIT-licensed Phosphor icons are bundled; no raster placeholders, remote fonts or third-party screenshot assets are used in the app.
- Content: ENTree replaces the reference name. Synthetic, internally consistent demo data is explicitly labeled. Folder/extension values and rectangle positions change with scanned data; the source's example values are not treated as actual disk measurements.

## Interaction verification

- Native worker scanned a real disposable fixture and reported both apparent and allocated bytes.
- Tree and file tables, file search, marked-review totals, demo recycle prevention and zoom/Fit checked.
- Appearance/palette controls and persistence after reload checked in both browser preview and native Electron.
- Native IPC rejects recycling the scan root. No actual user files were recycled during verification.
- Eleven filesystem tests passed; syntax checks passed; dependency audit reported zero vulnerabilities.

## Remaining validation limits

- Windows is verified locally. macOS/Linux scanner checks are configured in CI; native desktop behavior on those systems has not been manually verified here.
- Treemap placement is data-driven, so category rectangles do not reproduce the reference's exact static positions. This is expected for a disk analyzer.
- Very small rectangles omit labels and expose their path/size on hover.

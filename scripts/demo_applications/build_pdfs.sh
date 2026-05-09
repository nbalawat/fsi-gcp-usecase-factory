#!/usr/bin/env bash
# build_pdfs.sh — derive the demo-application PDFs from the Berkshire
# 10-K source fixture in services/atomic/document-extractor/tests/fixtures/.
#
# Demo PDFs are not committed to git (~22MB). Run this once per checkout
# to materialize them in scripts/demo_applications/BRW-*/files/.
#
# Requires: python3, pypdf (pip install pypdf)
#
# Usage:
#   bash scripts/demo_applications/build_pdfs.sh
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"
SOURCE_PDF="$REPO_ROOT/services/atomic/document-extractor/tests/fixtures/berkshire_2023.pdf"

if [[ ! -f "$SOURCE_PDF" ]]; then
    echo "ERROR: $SOURCE_PDF not found." >&2
    echo "Run: bash $REPO_ROOT/services/atomic/document-extractor/tests/fixtures/download.sh" >&2
    exit 1
fi

if ! python3 -c "import pypdf" 2>/dev/null; then
    echo "ERROR: pypdf not installed. pip install pypdf" >&2
    exit 1
fi

echo "Deriving demo PDFs from $(basename "$SOURCE_PDF") ..."
python3 - <<PYEOF
from pypdf import PdfReader, PdfWriter
from pathlib import Path

DEMO = Path("$DEMO_DIR")
SRC = Path("$SOURCE_PDF")
reader = PdfReader(str(SRC))
total = len(reader.pages)
print(f"  source: {total} pages")

# (start, end_exclusive)
slices = {
    "berkshire_10k_full":          (0,   None),
    "berkshire_10k_balance_sheet": (50,  80),
    "berkshire_10q_summary":       (28,  58),
    "berkshire_audited_financials":(40,  90),
    "berkshire_ar_aging":          (90,  100),
    "berkshire_board_minutes":     (8,   20),
    "berkshire_appraisal":         (100, 115),
    "deficient_chairman_only":     (0,   13),
}
raw_dir = DEMO / "_raw_pdfs"
raw_dir.mkdir(parents=True, exist_ok=True)
for name, (start, end) in slices.items():
    end_idx = end if end is not None else total
    writer = PdfWriter()
    for i in range(start, min(end_idx, total)):
        writer.add_page(reader.pages[i])
    out = raw_dir / f"{name}.pdf"
    with open(out, "wb") as f:
        writer.write(f)

# Distribute into BRW-* folders per documents.json
mapping = {
    "BRW-BERKSHIRE-2024": [
        ("10K_FY2023.pdf", "berkshire_10k_full"),
        ("AR_aging_Q4.pdf", "berkshire_ar_aging"),
    ],
    "BRW-MIDCAP-MFG": [
        ("audited_financials_FY2023.pdf", "berkshire_audited_financials"),
    ],
    "BRW-LARGE-CAP": [
        ("10K_FY2023.pdf", "berkshire_10k_full"),
        ("10Q_Q3_2024.pdf", "berkshire_10q_summary"),
        ("AR_aging_Q3.pdf", "berkshire_ar_aging"),
        ("board_minutes_Q3.pdf", "berkshire_board_minutes"),
    ],
    "BRW-RE-SECURED": [
        ("10K_FY2023.pdf", "berkshire_10k_balance_sheet"),
        ("AR_aging_Q4.pdf", "berkshire_ar_aging"),
        ("RE_appraisal_2024.pdf", "berkshire_appraisal"),
    ],
    "BRW-DEFICIENT-RETURN": [
        ("10K_FY2023.pdf", "deficient_chairman_only"),
    ],
}
for borrower, files in mapping.items():
    files_dir = DEMO / borrower / "files"
    files_dir.mkdir(parents=True, exist_ok=True)
    for outname, slice_name in files:
        src = raw_dir / f"{slice_name}.pdf"
        dest = files_dir / outname
        dest.write_bytes(src.read_bytes())
        print(f"  {borrower}/{outname}")

print("Done. Run: bash scripts/demo_applications/upload_all.sh")
PYEOF

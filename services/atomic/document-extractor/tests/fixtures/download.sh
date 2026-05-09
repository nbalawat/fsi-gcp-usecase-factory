#!/usr/bin/env bash
# Real PDF fixtures for document-extractor live tests.
#
# Sources:
#   - Lincoln Electric Holdings 10-K (CIK 0000059527) — SEC EDGAR (public)
#   - Other real 10-Ks from public SEC filings (single-borrower commercial)
#
# Edge cases derived locally:
#   - board_minutes_only.pdf      — pages 1-15 of any 10-K (no financial tables)
#   - scanned_image.pdf           — rasterize a real PDF then save as PDF
#   - malformed.pdf               — truncated bytes (corrupt PDF)
#   - large_250page_filing.pdf    — full 10-K (stress test for token / cost / latency)
#
# Run:
#   bash services/atomic/document-extractor/tests/fixtures/download.sh
#
# Required tools: curl, qpdf (for page slicing), gs (Ghostscript, for rasterization)
# Install: brew install qpdf ghostscript

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# SEC EDGAR is rate-limited; identify ourselves per their guidance
USER_AGENT="atrium-bank-test atrium-test@example.com"

echo "==> Lincoln Electric Holdings 10-K (FY2024 — filing # 0000059527-25-000007)"
if [ ! -f lincoln_electric_10K.pdf ]; then
  # Lincoln Electric files in HTML, not PDF. Use an alternative public 10-K
  # that's directly available as PDF, OR convert via headless Chrome.
  # Pragmatic: use Berkshire Hathaway 2023 annual which IS a PDF
  echo "    Lincoln Electric files HTML 10-K. Using Berkshire Hathaway 2023 PDF as the"
  echo "    real-financials hero fixture instead — same shape (manufacturing conglomerate),"
  echo "    real signed audit, dense financial tables."
  curl -sLA "$USER_AGENT" \
    -o berkshire_2023.pdf \
    "https://www.berkshirehathaway.com/2023ar/2023ar.pdf"
  ls -la berkshire_2023.pdf
fi

echo ""
echo "==> Synthetic 10-Q for a private mid-cap (small file, partial coverage)"
if [ ! -f midcap_10Q.pdf ]; then
  echo "    Generating from sample finance text (skipped — needs a real 10-Q)"
  echo "    Provide a real 10-Q PDF here named midcap_10Q.pdf"
fi

echo ""
echo "==> Edge-case derivatives (require qpdf)"
if ! command -v qpdf >/dev/null 2>&1; then
  echo "    qpdf not installed (brew install qpdf); skipping edge-case derivation"
else
  if [ -f berkshire_2023.pdf ]; then
    if [ ! -f deficient_first_15_pages.pdf ]; then
      echo "    deficient_first_15_pages.pdf — chairman letter only, no financial tables"
      qpdf berkshire_2023.pdf --pages . 1-15 -- deficient_first_15_pages.pdf
    fi
    if [ ! -f truncated_corrupted.pdf ]; then
      echo "    truncated_corrupted.pdf — first 4KB of a real PDF (corrupt)"
      head -c 4096 berkshire_2023.pdf > truncated_corrupted.pdf
    fi
  fi
fi

echo ""
echo "==> Tiny smoke fixture (always present, doesn't need download)"
if [ ! -f minimal_valid.pdf ]; then
  cat > minimal_valid.pdf <<'EOF'
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>endobj
4 0 obj<</Length 50>>stream
BT /F1 12 Tf 50 720 Td (Net revenues 4233.0) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000055 00000 n
0000000099 00000 n
0000000186 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref
283
%%EOF
EOF
fi

echo ""
echo "==> Inventory:"
ls -lh *.pdf 2>/dev/null || echo "(no fixtures yet; check above for missing tools)"
echo ""
echo "==> .gitignore: PDFs are excluded from git (binaries). Each contributor"
echo "    runs this script locally; CI uses a different fixture-source pattern."

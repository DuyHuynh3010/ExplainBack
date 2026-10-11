"""Generate synthetic boundary fixtures with Python's standard library only."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from io import BytesIO
import zlib

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "test-results/v3-audit/fixtures"
DEST.mkdir(parents=True, exist_ok=True)

def pdf(length=32, pages=1):
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    refs = []
    for _ in range(pages):
        number = len(objects) + 1
        refs.append(f"{number} 0 R")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents {number+1} 0 R >>".encode())
        stream = zlib.compress(b"BT /F1 0.001 Tf 40 740 Td (" + b"x" * length + b") Tj ET")
        objects.append(f"<< /Length {len(stream)} /Filter /FlateDecode >>\nstream\n".encode() + stream + b"\nendstream")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(refs)}] /Count {pages} >>".encode()
    data = b"%PDF-1.4\n"
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(data)
    data += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    data += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    data += f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return data

def docx(length, pad=0):
    output = BytesIO()
    template = ROOT / "tests/sources/fixtures/empty.docx"
    with ZipFile(template) as old, ZipFile(output, "w", ZIP_DEFLATED) as new:
        for item in old.infolist():
            content = old.read(item.filename)
            if item.filename == "word/document.xml":
                content = ('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + 'x' * length + '</w:t></w:r></w:p></w:body></w:document>').encode()
            new.writestr(item.filename, content)
        if pad:
            new.writestr("word/media/synthetic-padding.bin", b"0" * pad, compress_type=ZIP_STORED)
    return output.getvalue()

for limit in (20_000, 100_000):
    for offset in (-1, 0, 1):
        length = limit + offset
        (DEST / f"chars-{length}.pdf").write_bytes(pdf(length))
        # Mammoth appends two paragraph newlines; target RAW extraction count.
        (DEST / f"chars-{length}.docx").write_bytes(docx(length - 2))
for pages in (29, 30, 31):
    (DEST / f"pages-{pages}.pdf").write_bytes(pdf(pages=pages))
for length in (2_999_999, 3_000_000, 3_000_001):
    content = pdf()
    (DEST / f"bytes-{length}.pdf").write_bytes(content + b"\n%" + b"0" * (length - len(content) - 2))
    baseline = len(docx(32, 1)) - 1
    (DEST / f"bytes-{length}.docx").write_bytes(docx(32, length - baseline))
print("Generated synthetic PDF/DOCX boundary fixtures in test-results/v3-audit/fixtures.")

# Isolate archive guards using inert binary entries, without oversized source text.
base = docx(32)
with ZipFile(BytesIO(base)) as archive:
    base_count = len(archive.infolist())
    base_expanded = sum(item.file_size for item in archive.infolist())
for kind, limit in (("entries", 1000), ("entry-bytes", 5000000), ("expanded-bytes", 10000000)):
    for offset in (-1, 0, 1):
        output = BytesIO()
        with ZipFile(BytesIO(base)) as old, ZipFile(output, "w", ZIP_DEFLATED) as new:
            for item in old.infolist():
                new.writestr(item.filename, old.read(item.filename))
            if kind == "entries":
                for index in range(limit + offset - base_count):
                    new.writestr(f"word/media/empty-{index}.bin", b"")
            elif kind == "entry-bytes":
                new.writestr("word/media/padding.bin", b"0" * (limit + offset))
            else:
                new.writestr("word/media/first.bin", b"0" * 5000000)
                new.writestr("word/media/second.bin", b"0" * (limit + offset - base_expanded - 5000000))
        (DEST / f"{kind}-{limit + offset}.docx").write_bytes(output.getvalue())

"""Generate the readable Word guide from the canonical Markdown (stdlib only).

Run from any directory: python scripts/generate-project-guide.py
This deliberately supports the Markdown constructs used by the master context:
headings, paragraphs, fenced code, pipe tables, bullets, bold and inline code.
Unknown block syntax fails rather than silently dropping documentation.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "LIFEPILOT_MASTER_CONTEXT.md"
OUTPUT = ROOT / "docs" / "LifePilot_Project_Guide.docx"
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def x(value: str) -> str:
    return escape(value, {'"': '&quot;'})


def runs(value: str) -> str:
    """Convert source inline code/bold to real Word character formatting."""
    result = []
    for match in re.finditer(r'(`[^`]+`|\*\*[^*]+\*\*|[^`*]+|\*+)', value):
        part = match.group()
        if part.startswith('`') and part.endswith('`') and len(part) > 1:
            result.append(f'<w:r><w:rPr><w:rStyle w:val="Code"/></w:rPr><w:t xml:space="preserve">{x(part[1:-1])}</w:t></w:r>')
        elif part.startswith('**') and part.endswith('**') and len(part) > 4:
            result.append(f'<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{x(part[2:-2])}</w:t></w:r>')
        else:
            result.append(f'<w:r><w:t xml:space="preserve">{x(part)}</w:t></w:r>')
    return ''.join(result)


def paragraph(value: str, style: str = 'Normal', extra: str = '') -> str:
    return f'<w:p><w:pPr><w:pStyle w:val="{style}"/>{extra}</w:pPr>{runs(value)}</w:p>'


def parse(text: str) -> tuple[list[tuple], list[tuple[str, str]]]:
    lines = text.splitlines()
    blocks: list[tuple] = []
    headings: list[tuple[str, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('```'):
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i]); i += 1
            if i == len(lines):
                raise ValueError('Unclosed Markdown code fence')
            blocks.append(('code', code)); i += 1
            continue
        heading = re.match(r'^(#{1,3})\s+(.+)$', line)
        if heading:
            level, title = len(heading[1]), heading[2]
            anchor = f'section_{len(headings) + 1}'
            blocks.append(('heading', level, title, anchor))
            headings.append((title, anchor))
            i += 1
            continue
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [cell.strip() for cell in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-{3,}:?', cell) for cell in cells):
                    rows.append(cells)
                i += 1
            if len(rows) < 2 or any(len(row) != len(rows[0]) for row in rows):
                raise ValueError('Malformed Markdown table')
            blocks.append(('table', rows))
            continue
        if line.startswith('- '):
            while i < len(lines) and lines[i].startswith('- '):
                blocks.append(('bullet', lines[i][2:])); i += 1
            continue
        if re.match(r'^\d+\. ', line):
            while i < len(lines) and re.match(r'^\d+\. ', lines[i]):
                blocks.append(('number', re.sub(r'^\d+\. ', '', lines[i]))); i += 1
            continue
        if line.startswith('#') or line.startswith('>'):
            raise ValueError(f'Unsupported Markdown block: {line[:60]}')
        body = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not (lines[i].startswith(('#', '|', '```', '- ')) or re.match(r'^\d+\. ', lines[i])):
            body.append(lines[i].strip()); i += 1
        blocks.append(('paragraph', ' '.join(body)))
    return blocks, headings


def table(rows: list[list[str]]) -> str:
    n = len(rows[0])
    widths = ([1100, 1850, 6410] if n == 3 else [1600, 1900, 3500, 2360] if n == 4 else [3600, 5760] if n == 2 else [9360 // n] * n)
    widths[-1] = 9360 - sum(widths[:-1])
    grid = ''.join(f'<w:gridCol w:w="{width}"/>' for width in widths)
    output = [f'<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblInd w:w="120" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="D6E4DC"/><w:insideH w:val="single" w:sz="4" w:color="E3EBE6"/></w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:start w:w="120" w:type="dxa"/><w:end w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>{grid}</w:tblGrid>']
    for row_index, row in enumerate(rows):
        cells = []
        for width, value in zip(widths, row):
            fill = '<w:shd w:fill="E8F5EE"/>' if row_index == 0 else ('<w:shd w:fill="F7FAF8"/>' if row_index % 2 == 0 else '')
            cells.append(f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{fill}</w:tcPr>{paragraph(value, "TableHead" if row_index == 0 else "TableBody")}</w:tc>')
        repeat = '<w:trPr><w:tblHeader w:val="true"/></w:trPr>' if row_index == 0 else ''
        output.append(f'<w:tr>{repeat}{"".join(cells)}</w:tr>')
    output.append('</w:tbl>')
    return ''.join(output)


def style(name: str, size: int, color: str, before: int, after: int, *, bold: bool = False, keep: bool = False, font: str = 'Aptos') -> str:
    keep_xml = '<w:keepNext/>' if keep else ''
    outline = f'<w:outlineLvl w:val="{int(name[-1]) - 1}"/>' if re.fullmatch(r'Heading[123]', name) else ''
    return f'<w:style w:type="paragraph" w:styleId="{name}"><w:name w:val="{name}"/><w:pPr>{keep_xml}{outline}<w:spacing w:before="{before}" w:after="{after}" w:line="290" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}"/><w:color w:val="{color}"/><w:sz w:val="{size}"/>{"<w:b/>" if bold else ""}</w:rPr></w:style>'


STYLES = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {NS}>
{style('Normal', 20, '24342B', 0, 140)}
{style('Title', 48, '153F2A', 0, 240, bold=True, keep=True)}
{style('Subtitle', 24, '53705E', 0, 120)}
{style('Heading1', 31, '176943', 360, 150, bold=True, keep=True)}
{style('Heading2', 26, '176943', 280, 120, bold=True, keep=True)}
{style('Heading3', 22, '176943', 240, 100, bold=True, keep=True)}
{style('Bullet', 20, '24342B', 0, 90)}
{style('Number', 20, '24342B', 0, 90)}
{style('CodeBlock', 18, '244136', 0, 0, font='Consolas')}
{style('TableHead', 18, '153F2A', 0, 0, bold=True)}
{style('TableBody', 18, '24342B', 0, 0)}
{style('Toc', 20, '176943', 0, 110)}
<w:style w:type="character" w:styleId="Code"><w:name w:val="Code"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="176943"/><w:sz w:val="18"/></w:rPr></w:style>
</w:styles>'''

NUMBERING = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering {NS}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>'''


def render(blocks: list[tuple], headings: list[tuple[str, str]], date: str) -> bytes:
    body = []
    body.append(paragraph('DMJ Labs', 'Subtitle', '<w:spacing w:before="1800" w:after="300"/>'))
    body.append(paragraph('LifePilot – Project Master Guide', 'Title'))
    body.append(paragraph('Technical reference · Architecture · Handover', 'Subtitle'))
    body.append(paragraph(f'Last updated: {date}', 'Subtitle', '<w:spacing w:before="600"/>'))
    body.append(paragraph('Generated from docs/LIFEPILOT_MASTER_CONTEXT.md. The Markdown is the canonical source.'))
    body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    body.append(paragraph('Contents', 'Heading1'))
    for title, anchor in headings:
        body.append(f'<w:p><w:pPr><w:pStyle w:val="Toc"/></w:pPr><w:hyperlink w:anchor="{anchor}" w:history="1">{runs(title)}</w:hyperlink></w:p>')
    body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    for block in blocks:
        kind = block[0]
        if kind == 'heading':
            _, level, title, anchor = block
            bookmark_id = len(body)
            body.append(f'<w:p><w:pPr><w:pStyle w:val="Heading{level}"/></w:pPr><w:bookmarkStart w:id="{bookmark_id}" w:name="{anchor}"/>{runs(title)}<w:bookmarkEnd w:id="{bookmark_id}"/></w:p>')
        elif kind == 'paragraph':
            body.append(paragraph(block[1]))
        elif kind in ('bullet', 'number'):
            number = 1 if kind == 'bullet' else 2
            num = f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{number}"/></w:numPr>'
            body.append(paragraph(block[1], 'Bullet' if kind == 'bullet' else 'Number', num))
        elif kind == 'code':
            for line in block[1]:
                body.append(paragraph(line or ' ', 'CodeBlock', '<w:ind w:left="300"/><w:shd w:fill="F1F6F2"/>'))
        elif kind == 'table':
            body.append(table(block[1]))
    sect = '<w:sectPr><w:headerReference w:type="default" r:id="rId4"/><w:footerReference w:type="default" r:id="rId5"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr>'
    document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>{"".join(body)}{sect}</w:body></w:document>'
    header = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="648070"/><w:sz w:val="16"/></w:rPr><w:t>LifePilot  |  DMJ Labs</w:t></w:r></w:p></w:hdr>'
    footer = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="648070"/><w:sz w:val="16"/></w:rPr><w:t>Page </w:t></w:r><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>'
    types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'''
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'''
    doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'''
    from io import BytesIO
    buffer = BytesIO()
    with ZipFile(buffer, 'w', ZIP_DEFLATED) as archive:
        for name, content in {'[Content_Types].xml': types, '_rels/.rels': root_rels, 'word/document.xml': document, 'word/styles.xml': STYLES, 'word/numbering.xml': NUMBERING, 'word/_rels/document.xml.rels': doc_rels, 'word/header1.xml': header, 'word/footer1.xml': footer}.items():
            entry = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            archive.writestr(entry, content)
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='fail if the DOCX is missing or stale')
    args = parser.parse_args()
    source = SOURCE.read_text(encoding='utf-8')
    blocks, headings = parse(source)
    if not headings:
        raise ValueError('Master context has no headings')
    date = dt.datetime.fromtimestamp(SOURCE.stat().st_mtime).astimezone().date().isoformat()
    result = render(blocks, headings, date)
    from io import BytesIO
    with ZipFile(BytesIO(result)) as archive:
        for name in archive.namelist():
            if name.endswith(('.xml', '.rels')):
                ET.fromstring(archive.read(name))
        document = archive.read('word/document.xml').decode('utf-8')
        assert document.count('<w:tbl>') == sum(block[0] == 'table' for block in blocks)
        assert document.count('<w:bookmarkStart') == len(headings)
        assert '<w:fldSimple w:instr="PAGE"/>' in archive.read('word/footer1.xml').decode('utf-8')
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != result:
            raise SystemExit(f'Stale guide: run python scripts/generate-project-guide.py')
        print(f'Guide is current: {OUTPUT.relative_to(ROOT)}')
    else:
        OUTPUT.write_bytes(result)
        print(f'Generated {OUTPUT.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}')


if __name__ == '__main__':
    main()

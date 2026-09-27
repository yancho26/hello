#!/usr/bin/env python3
"""Създава примерни списъци с пациенти в различни формати за тестовете.

Нужни са: python3 с openpyxl и xlwt, и LibreOffice (soffice) за
превръщането в .xls, .ods, HTML и CSV. Файловете са измислени."""

import datetime, os, subprocess, shutil, tempfile
import openpyxl, xlwt

HERE = os.path.dirname(os.path.abspath(__file__))
W = [2, 4, 8, 5, 10, 9, 7, 3, 6]

def egn(y, m, d, serial, female):
    mm = m + 40 if y >= 2000 else m
    order = serial * 2 + (1 if female else 0)
    base = f"{y % 100:02d}{mm:02d}{d:02d}{order:03d}"
    s = sum(w * int(c) for w, c in zip(W, base))
    return base + str((s % 11) % 10)

ROWS = [
    # ЕГН, име, презиме, фамилия, дата, пол, телефон, адрес, диагнози
    (egn(1958, 3, 14, 21, False), "Иван", "Петров", "Георгиев", datetime.date(1958, 3, 14), "м", 888123456, "гр. София, ул. Родопи 12", "I10; E11.9 Захарен диабет тип 2"),
    (egn(1962, 11, 2, 35, True), "МАРИЯ", "ИВАНОВА", "ДИМИТРОВА", datetime.date(1962, 11, 2), "ж", "0887 555 111", "гр. София, бул. Витоша 5", "Е78.0 Хиперхолестеролемия, I48 Предсърдно мъждене"),
    (egn(2005, 7, 9, 12, False), "Петър", "Николов", "Стоянов", datetime.date(2005, 7, 9), "м", "", "с. Лозен", ""),
    (egn(2019, 1, 25, 44, True), "Ема", "Георгиева", "Колева", datetime.date(2019, 1, 25), "ж", 899765432, "гр. София", "J45 Бронхиална астма"),
    ("1234567890", "Грешно", "", "ЕГН", None, "", "", "", ""),
    (egn(1947, 5, 30, 8, True), "Стефка", "Ангелова", "Маринова", datetime.date(1947, 5, 30), "ж", "02 123 4567", "гр. София, ж.к. Младост 1", "I50 Сърдечна недостатъчност; N18.3; M81.0"),
]
HEADER = ["№", "ЕГН", "Име", "Презиме", "Фамилия", "Дата на раждане", "Пол", "Телефон", "Адрес", "Диагнози"]

def xlsx(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Пациенти"
    ws.append(["Списък на регистрираните пациенти към 27.09.2026"])
    ws.append([])
    ws.append(HEADER)
    for i, r in enumerate(ROWS, 1):
        e = int(r[0]) if i in (1, 3) else r[0]   # две ЕГН като числа — водещата нула се губи
        ws.append([i, e, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]])
        if r[4]:
            ws.cell(row=ws.max_row, column=6).number_format = "dd.mm.yyyy"
    wb.create_sheet("Бележки").append(["Изготвено от програмата на практиката"])
    wb.save(path)

def xls_xlwt(path):
    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet("Пациенти")
    date = xlwt.easyxf(num_format_str="dd.mm.yyyy")
    for c, h in enumerate(HEADER[1:]):
        ws.write(0, c, h)
    for i, r in enumerate(ROWS, 1):
        for c, v in enumerate(r):
            if isinstance(v, datetime.date):
                ws.write(i, c, v, date)
            elif v != "" and v is not None:
                ws.write(i, c, v)
    wb.save(path)

def xml2003(path):
    cells = lambda vals: "".join(f'<Cell><Data ss:Type="String">{v}</Data></Cell>' for v in vals)
    rows = [f"<Row>{cells(HEADER[1:6])}</Row>"]
    for r in ROWS[:3]:
        d = r[4].isoformat() + "T00:00:00.000" if r[4] else ""
        rows.append(f'<Row>{cells(r[:4])}<Cell><Data ss:Type="DateTime">{d}</Data></Cell></Row>')
    xml = ('<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n'
           '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" '
           'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
           f'<Worksheet ss:Name="Пациенти"><Table>{"".join(rows)}</Table></Worksheet></Workbook>')
    open(path, "w", encoding="utf-8").write(xml)

def csv1251(path):
    lines = [";".join(HEADER[1:6] + ["Телефон"])]
    for r in ROWS[:4]:
        d = r[4].strftime("%d.%m.%Y") if r[4] else ""
        lines.append(";".join([r[0], r[1], r[2], f'"{r[3]}"', d, str(r[6])]))
    open(path, "wb").write(("\r\n".join(lines) + "\r\n").encode("cp1251"))

def convert(src, ext, filt, out):
    tmp = tempfile.mkdtemp()
    subprocess.run(["soffice", "--headless", "--convert-to", f"{ext}:{filt}", "--outdir", tmp, src],
                   check=True, capture_output=True)
    produced = os.path.join(tmp, os.path.splitext(os.path.basename(src))[0] + "." + ext)
    shutil.move(produced, out)
    shutil.rmtree(tmp)

if __name__ == "__main__":
    x = os.path.join(HERE, "patients-openpyxl.xlsx")
    xlsx(x)
    xls_xlwt(os.path.join(HERE, "patients-xlwt.xls"))
    xml2003(os.path.join(HERE, "patients-2003.xml"))
    csv1251(os.path.join(HERE, "patients-1251.csv"))
    convert(x, "xls", "MS Excel 97", os.path.join(HERE, "patients-libreoffice.xls"))
    convert(x, "ods", "calc8", os.path.join(HERE, "patients-libreoffice.ods"))
    convert(x, "xlsx", "Calc MS Excel 2007 XML", os.path.join(HERE, "patients-libreoffice.xlsx"))
    convert(x, "html", "HTML (StarCalc)", os.path.join(HERE, "patients-libreoffice.html"))
    print("готово")

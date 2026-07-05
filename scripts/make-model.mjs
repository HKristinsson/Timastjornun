// Býr til gagnvirkt tekju-/framlegðarlíkan fyrir Tímaverk (.xlsx með formúlum).
import { fileURLToPath } from "node:url";
import path from "node:path";
import ExcelJS from "exceljs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "Tímaverk-tekjulíkan.xlsx");

const wb = new ExcelJS.Workbook();
wb.creator = "Tímaverk";
const ws = wb.addWorksheet("Tekjulíkan", {
  views: [{ showGridLines: false }],
});

ws.getColumn(1).width = 38;
ws.getColumn(2).width = 18;
ws.getColumn(3).width = 46;

const KR = '#,##0" kr"';
const PCT = "0%";
const NUM = "#,##0";

const BLUE = "FF2563EB";
const LIGHT = "FFDBEAFE"; // input-reitir
const GREY = "FFF1F5F9";

function title(row, text) {
  ws.mergeCells(`A${row}:C${row}`);
  const c = ws.getCell(`A${row}`);
  c.value = text;
  c.font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  ws.getRow(row).height = 24;
}

function header(row, text) {
  ws.mergeCells(`A${row}:C${row}`);
  const c = ws.getCell(`A${row}`);
  c.value = text;
  c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  c.alignment = { vertical: "middle" };
  ws.getRow(row).height = 20;
}

// label + value (+ optional note). kind: 'input' | 'calc'. fmt: number format.
function row(r, label, value, { fmt = NUM, kind = "calc", note = "", bold = false } = {}) {
  ws.getCell(`A${r}`).value = label;
  ws.getCell(`A${r}`).font = { bold };
  const v = ws.getCell(`B${r}`);
  v.value = value;
  v.numFmt = fmt;
  v.alignment = { horizontal: "right" };
  v.font = { bold: bold || kind === "input" };
  if (kind === "input") {
    v.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
    v.border = {
      top: { style: "thin", color: { argb: "FF93C5FD" } },
      left: { style: "thin", color: { argb: "FF93C5FD" } },
      bottom: { style: "thin", color: { argb: "FF93C5FD" } },
      right: { style: "thin", color: { argb: "FF93C5FD" } },
    };
  }
  if (note) {
    ws.getCell(`C${r}`).value = note;
    ws.getCell(`C${r}`).font = { color: { argb: "FF64748B" }, size: 10 };
  }
}

title(1, "Tímaverk — tekju- og framlegðarlíkan");
ws.getCell("A2").value = "Bláu reitirnir eru forsendur sem þú breytir. Allt annað reiknast sjálfkrafa. Verð án VSK.";
ws.getCell("A2").font = { italic: true, color: { argb: "FF64748B" }, size: 10 };
ws.mergeCells("A2:C2");

header(4, "FORSENDUR");
row(5, "Fjöldi fyrirtækja", 50, { kind: "input" });
row(6, "Meðalfjöldi starfsmanna á fyrirtæki", 40, { kind: "input" });
row(7, "Meðalfjöldi bíla á fyrirtæki", 40, { kind: "input" });
row(8, "Hlutfall starfsmanna á Plús-pakka", 0.6, { kind: "input", fmt: PCT });
row(9, "Hlutfall bíla með faratæki-búnaði", 0.8, { kind: "input", fmt: PCT });

header(11, "VERÐ (kr/mán, án VSK)");
row(12, "Grunnur — per starfsmann", 1290, { kind: "input", fmt: KR });
row(13, "Plús — per starfsmann", 1890, { kind: "input", fmt: KR });
row(14, "Faratæki hugbúnaður — per bíl", 1990, { kind: "input", fmt: KR });
row(15, "Vélbúnaðar-leiga — per bíl", 690, { kind: "input", fmt: KR, note: "Eða selt eitt sinn ~7.900 kr" });

header(17, "KOSTNAÐUR (þinn)");
row(18, "SIM/gagnamagn — per bíl/mán", 300, { kind: "input", fmt: KR });
row(19, "Vélbúnaður — innkaupsverð per tæki", 6000, { kind: "input", fmt: KR });
row(20, "Líftími tækis (mán)", 36, { kind: "input" });
row(21, "Innviðir (þjónar/DB/Traccar) — fast/mán", 150000, { kind: "input", fmt: KR });
row(22, "Stuðningur/þjónusta — per fyrirtæki/mán", 5000, { kind: "input", fmt: KR });
row(23, "Greiðslugjöld (% af tekjum)", 0.02, { kind: "input", fmt: PCT });

header(25, "REIKNAÐ UMFANG");
row(26, "Heildarfjöldi starfsmanna", { formula: "B5*B6", result: 2000 }, { fmt: NUM });
row(27, "Heildarfjöldi bíla", { formula: "B5*B7", result: 2000 }, { fmt: NUM });
row(28, "Bílar með faratæki", { formula: "B27*B9", result: 1600 }, { fmt: NUM });
row(29, "Blandað verð per starfsmann", { formula: "B13*B8+B12*(1-B8)", result: 1650 }, { fmt: KR });

header(31, "TEKJUR / MÁNUÐI");
row(32, "Tímaskráning", { formula: "B26*B29", result: 3300000 }, { fmt: KR });
row(33, "Faratæki — hugbúnaður", { formula: "B28*B14", result: 3184000 }, { fmt: KR });
row(34, "Faratæki — vélbúnaðar-leiga", { formula: "B28*B15", result: 1104000 }, { fmt: KR });
row(35, "HEILDARTEKJUR (MRR)", { formula: "SUM(B32:B34)", result: 7588000 }, { fmt: KR, bold: true });
row(36, "Árstekjur (ARR)", { formula: "B35*12", result: 91056000 }, { fmt: KR, bold: true });

header(38, "KOSTNAÐUR / MÁNUÐI");
row(39, "SIM/gagnamagn", { formula: "B28*B18", result: 480000 }, { fmt: KR });
row(40, "Vélbúnaðar-afskrift", { formula: "B28*(B19/B20)", result: 266667 }, { fmt: KR });
row(41, "Innviðir", { formula: "B21", result: 150000 }, { fmt: KR });
row(42, "Stuðningur", { formula: "B5*B22", result: 250000 }, { fmt: KR });
row(43, "Greiðslugjöld", { formula: "B35*B23", result: 151760 }, { fmt: KR });
row(44, "HEILDARKOSTNAÐUR", { formula: "SUM(B39:B43)", result: 1298427 }, { fmt: KR, bold: true });

header(46, "FRAMLEGÐ");
row(47, "Framlegð (kr/mán)", { formula: "B35-B44", result: 6289573 }, { fmt: KR, bold: true });
row(48, "Framlegð (%)", { formula: "B47/B35", result: 0.829 }, { fmt: PCT, bold: true });
row(49, "Framlegð (kr/ár)", { formula: "B47*12", result: 75474876 }, { fmt: KR, bold: true });

header(51, "Á HVERT FYRIRTÆKI (meðaltal)");
row(52, "Tekjur á fyrirtæki/mán", { formula: "B35/B5", result: 151760 }, { fmt: KR });
row(53, "Framlegð á fyrirtæki/mán", { formula: "B47/B5", result: 125791 }, { fmt: KR });

// Highlight lykiltölur (MRR, ARR, framlegð)
for (const r of [35, 36, 44, 47, 48, 49]) {
  ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
}

ws.getCell("A55").value =
  "Skýring: Vélbúnaður er borinn af viðskiptavini (leiga eða kaup) — hér reiknað sem leigutekjur að frádreginni afskrift. VSK (24%) er ekki innifalinn. Tölurnar eru tillögur til að fínstilla.";
ws.getCell("A55").font = { italic: true, color: { argb: "FF64748B" }, size: 10 };
ws.mergeCells("A55:C56");
ws.getCell("A55").alignment = { wrapText: true, vertical: "top" };

await wb.xlsx.writeFile(out);
console.log("✅ Skrifað:", path.basename(out));

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sampleBooks } from "../public/js/sample-data.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coverDir = resolve(root, "public", "assets", "covers");

const palettes = {
  study: ["#1b5238", "#76b589", "#f6eed8", "#fffaf0", "#123d2a"],
  research: ["#244f6f", "#78a7b7", "#f3efe0", "#fffaf0", "#102d3d"],
  code: ["#102a43", "#38bdf8", "#d9f99d", "#f8fbff", "#061826"],
  data: ["#241638", "#8b5cf6", "#f59e0b", "#fff7ed", "#140c24"],
  science: ["#124559", "#4b9662", "#f2d16b", "#f6fff2", "#082f3d"],
  math: ["#1f2937", "#d7b95a", "#f8fafc", "#ffffff", "#111827"],
  business: ["#173125", "#d7b95a", "#f4e5b4", "#fffaf0", "#123d2a"],
  design: ["#284f5f", "#f4a261", "#cfe9d2", "#fffaf0", "#16323d"],
  craft: ["#4a2f43", "#e6a4b4", "#f5d38b", "#fff7f0", "#291825"],
  classic: ["#40513b", "#d8a657", "#f5ead2", "#fff8ea", "#1f2d20"],
  whimsy: ["#5a7d3d", "#f5b84b", "#f7e0a4", "#fff6d8", "#253d21"],
  detective: ["#192734", "#c99a3e", "#d7ecf0", "#fff8df", "#101923"],
  gothic: ["#101820", "#477a7d", "#c46f55", "#f2eee8", "#070b0d"],
  sea: ["#123d4b", "#4b8da0", "#e8c16a", "#f4fbf8", "#062733"],
  steam: ["#34251c", "#b87545", "#d7b95a", "#fff3df", "#1d1410"]
};

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function wrapWords(text, maxChars, maxLines) {
  const words = String(text || "Untitled Book").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;

    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }

    if (lines.length === maxLines) break;
  }

  if (line && lines.length < maxLines) lines.push(line);

  if (words.join(" ").length > lines.join(" ").length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\.*$/, "")}...`;
  }

  return lines;
}

function initials(title) {
  return String(title || "Book")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("") || "BK";
}

function hashText(text) {
  return [...String(text || "")].reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0;
  }, 11);
}

function textLines(lines, x, y, size, fill, weight = 900, leading = 1.08) {
  return lines.map((line, index) => {
    const dy = y + index * size * leading;
    return `<text x="${x}" y="${dy}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`;
  }).join("\n");
}

function moodForBook(book) {
  const text = `${book.title} ${book.author} ${book.category}`.toLowerCase();

  if (/frankenstein|cthulhu|dunwich|phantom|udolpho/.test(text)) return "gothic";
  if (/sherlock|lupin|mystery|case-book/.test(text)) return "detective";
  if (/moby|whale|steam-ships|fighting|war paint|hunniwell/.test(text)) return "sea";
  if (/alice|oz|rabbit|little women|creative writing/.test(text)) return "whimsy";
  if (/pride|middlemarch/.test(text)) return "classic";
  if (/steam|invention/.test(text)) return "steam";
  if (/code|web|computing/.test(text)) return "code";
  if (/data|ethics/.test(text)) return "data";
  if (/biology|climate/.test(text)) return "science";
  if (/algebra|64-square|computer/.test(text)) return "math";
  if (/business|finance/.test(text)) return "business";
  if (/flower|needlework|costume/.test(text)) return "craft";
  if (book.category === "Design") return "design";
  if (book.category === "Technology") return "code";
  if (book.category === "Science") return "science";
  if (book.category === "Business") return "business";
  if (book.category === "Literature") return "classic";
  if (/research|writing/.test(text)) return "research";
  return "study";
}

function person({ x, y, shirt, skin = "#f1c79f", hair = "#1c2420", scale = 1, pose = "read" }) {
  const armPath = pose === "point"
    ? `<path d="M44 120 C88 86, 126 78, 160 54" fill="none" stroke="${skin}" stroke-width="17" stroke-linecap="round"/>`
    : `<path d="M40 124 C68 152, 106 150, 140 134" fill="none" stroke="${skin}" stroke-width="17" stroke-linecap="round"/>`;

  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M8 244 C18 166, 48 114, 91 102 C137 118, 160 168, 174 244 Z" fill="${shirt}"/>
      ${armPath}
      <circle cx="92" cy="68" r="44" fill="${skin}"/>
      <path d="M43 72 C40 28, 76 0, 122 14 C145 22, 156 43, 146 66 C122 52, 90 54, 62 78 Z" fill="${hair}"/>
      <circle cx="76" cy="70" r="5" fill="${hair}" opacity="0.7"/>
      <circle cx="110" cy="70" r="5" fill="${hair}" opacity="0.7"/>
      <path d="M78 91 C90 101, 105 101, 116 91" fill="none" stroke="${hair}" stroke-width="5" stroke-linecap="round"/>
    </g>
  `;
}

function openBook(x, y, w, color = "#fffaf0", ink = "#123d2a") {
  const h = w * 0.36;
  return `
    <g>
      <path d="M${x} ${y + 12} C${x + w * 0.22} ${y - 18}, ${x + w * 0.42} ${y - 2}, ${x + w * 0.5} ${y + 26} L${x + w * 0.5} ${y + h} C${x + w * 0.34} ${y + h - 28}, ${x + w * 0.16} ${y + h - 22}, ${x} ${y + h} Z" fill="${color}"/>
      <path d="M${x + w * 0.5} ${y + 26} C${x + w * 0.62} ${y - 2}, ${x + w * 0.82} ${y - 18}, ${x + w} ${y + 12} L${x + w} ${y + h} C${x + w * 0.84} ${y + h - 22}, ${x + w * 0.66} ${y + h - 28}, ${x + w * 0.5} ${y + h} Z" fill="#ffffff"/>
      <path d="M${x + w * 0.5} ${y + 28} V${y + h}" stroke="${ink}" stroke-opacity="0.25" stroke-width="5"/>
      <path d="M${x + 34} ${y + 52} H${x + w * 0.38} M${x + 34} ${y + 80} H${x + w * 0.4} M${x + w * 0.6} ${y + 52} H${x + w - 34} M${x + w * 0.58} ${y + 80} H${x + w - 46}" stroke="${ink}" stroke-opacity="0.22" stroke-width="8" stroke-linecap="round"/>
    </g>
  `;
}

function commonSceneBase(p) {
  return `
    <circle cx="612" cy="174" r="84" fill="${p[3]}" opacity="0.16"/>
    <circle cx="652" cy="250" r="48" fill="${p[3]}" opacity="0.11"/>
    <path d="M34 880 C180 824 310 864 468 816 C582 782 660 816 720 760 V1040 H34 Z" fill="${p[3]}" opacity="0.14"/>
  `;
}

function sceneStudy(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="76" y="560" width="568" height="338" rx="40" fill="#ffffff" opacity="0.88"/>
    ${person({ x: 112, y: 632, shirt: p[1], pose: "read", scale: 0.92 })}
    ${openBook(292, 718, 278, p[3], p[4])}
    <rect x="420" y="598" width="112" height="128" rx="16" fill="${p[2]}" opacity="0.86"/>
    <path d="M446 636h54M446 666h72M446 696h44" stroke="${p[4]}" stroke-width="10" stroke-linecap="round" opacity="0.26"/>
    <path d="M554 556v116" stroke="${p[1]}" stroke-width="10" stroke-linecap="round"/>
    <circle cx="554" cy="534" r="26" fill="${p[2]}"/>
  `;
}

function sceneResearch(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="88" y="542" width="540" height="352" rx="38" fill="#ffffff" opacity="0.9"/>
    <rect x="320" y="612" width="230" height="172" rx="22" fill="${p[2]}" opacity="0.9"/>
    <path d="M356 654h132M356 692h156M356 730h100" stroke="${p[4]}" stroke-opacity="0.28" stroke-width="12" stroke-linecap="round"/>
    <circle cx="492" cy="766" r="54" fill="none" stroke="${p[1]}" stroke-width="18"/>
    <path d="M530 804l66 68" stroke="${p[1]}" stroke-width="22" stroke-linecap="round"/>
    ${person({ x: 104, y: 638, shirt: p[1], pose: "point", scale: 0.9 })}
  `;
}

function sceneCode(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="92" y="552" width="536" height="340" rx="42" fill="#f8fbff" opacity="0.92"/>
    <rect x="306" y="616" width="262" height="168" rx="24" fill="${p[4]}"/>
    <rect x="332" y="642" width="210" height="106" rx="12" fill="#061826"/>
    <path d="M360 676h54M360 712h114M360 746h82M462 676h56" stroke="${p[1]}" stroke-width="10" stroke-linecap="round"/>
    <path d="M286 790h310" stroke="${p[0]}" stroke-width="26" stroke-linecap="round" opacity="0.34"/>
    ${person({ x: 110, y: 636, shirt: p[2], hair: "#102a43", pose: "point", scale: 0.9 })}
    <path d="M562 548h38v38h-38zM594 586h38v38h-38zM546 614h30v30h-30z" fill="${p[1]}" opacity="0.35"/>
  `;
}

function sceneData(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="90" y="548" width="540" height="344" rx="40" fill="#fff7ed" opacity="0.94"/>
    <rect x="374" y="604" width="174" height="182" rx="26" fill="${p[0]}"/>
    <path d="M426 668v-42h70v42M412 668h98v78h-98z" fill="none" stroke="${p[1]}" stroke-width="16" stroke-linejoin="round"/>
    <path d="M270 786h308" stroke="${p[4]}" stroke-width="18" stroke-linecap="round" opacity="0.18"/>
    <path d="M284 704h68M318 656v148" stroke="${p[2]}" stroke-width="13" stroke-linecap="round"/>
    <path d="M246 656h144L356 704H282z" fill="${p[2]}" opacity="0.78"/>
    <path d="M252 826h132L350 778H286z" fill="${p[2]}" opacity="0.55"/>
    ${person({ x: 104, y: 638, shirt: p[1], pose: "read", scale: 0.88 })}
  `;
}

function sceneScience(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="82" y="540" width="556" height="354" rx="40" fill="#f6fff2" opacity="0.92"/>
    <path d="M448 610v122M420 610h68M432 732h92" stroke="${p[0]}" stroke-width="15" stroke-linecap="round"/>
    <circle cx="516" cy="674" r="42" fill="none" stroke="${p[1]}" stroke-width="14"/>
    <path d="M354 734h86l-44 104h-42z" fill="${p[1]}"/>
    <path d="M374 776h46" stroke="#ffffff" stroke-width="11" stroke-linecap="round" opacity="0.7"/>
    <path d="M518 590 C560 530 620 552 618 612 C572 622 540 618 518 590Z" fill="${p[2]}"/>
    <path d="M548 600 C532 626 516 654 500 698" stroke="${p[0]}" stroke-width="8" stroke-linecap="round" opacity="0.42"/>
    ${person({ x: 104, y: 634, shirt: p[1], pose: "point", scale: 0.86 })}
  `;
}

function sceneMath(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="92" y="552" width="536" height="340" rx="40" fill="#ffffff" opacity="0.9"/>
    <g transform="translate(330 614)">
      ${Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => {
        const fill = (row + col) % 2 ? p[0] : p[2];
        return `<rect x="${col * 26}" y="${row * 26}" width="26" height="26" fill="${fill}" opacity="${(row + col) % 2 ? 0.86 : 0.95}"/>`;
      }).join("")).join("")}
    </g>
    <circle cx="472" cy="784" r="54" fill="${p[1]}"/>
    <path d="M450 758h44M472 736v82" stroke="#ffffff" stroke-width="12" stroke-linecap="round"/>
    ${person({ x: 110, y: 638, shirt: p[1], pose: "read", scale: 0.9 })}
    <path d="M266 780 C310 746 340 746 376 784" fill="none" stroke="${p[4]}" stroke-width="12" stroke-linecap="round" opacity="0.28"/>
  `;
}

function sceneBusiness(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="88" y="548" width="544" height="344" rx="38" fill="#fffaf0" opacity="0.94"/>
    <path d="M342 798V722M402 798V654M462 798V688M522 798V620" stroke="${p[0]}" stroke-width="32" stroke-linecap="round"/>
    <path d="M328 718C382 708 398 650 454 676C492 692 510 624 548 606" fill="none" stroke="${p[1]}" stroke-width="14" stroke-linecap="round"/>
    <path d="M322 828h260" stroke="${p[4]}" stroke-width="16" stroke-linecap="round" opacity="0.18"/>
    <circle cx="372" cy="858" r="28" fill="${p[1]}"/>
    <circle cx="430" cy="850" r="28" fill="${p[2]}"/>
    <path d="M364 858h18M422 850h18" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>
    ${person({ x: 106, y: 634, shirt: p[0], skin: "#e7b98f", pose: "point", scale: 0.88 })}
  `;
}

function sceneDesign(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="92" y="546" width="536" height="348" rx="40" fill="#fffaf0" opacity="0.92"/>
    <rect x="360" y="606" width="178" height="242" rx="30" fill="${p[0]}"/>
    <rect x="382" y="638" width="134" height="166" rx="18" fill="#ffffff"/>
    <rect x="404" y="670" width="84" height="18" rx="9" fill="${p[1]}"/>
    <rect x="404" y="714" width="96" height="18" rx="9" fill="${p[0]}" opacity="0.24"/>
    <rect x="404" y="756" width="72" height="36" rx="14" fill="${p[2]}"/>
    <circle cx="540" cy="632" r="54" fill="${p[2]}" opacity="0.72"/>
    <path d="M548 616v48l36-24z" fill="${p[0]}" opacity="0.38"/>
    ${person({ x: 104, y: 634, shirt: p[1], pose: "point", scale: 0.88 })}
  `;
}

function sceneCraft(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="82" y="540" width="556" height="354" rx="42" fill="#fff7f0" opacity="0.94"/>
    <path d="M448 610 C502 638, 526 718, 536 836 H360 C370 720, 394 638, 448 610Z" fill="${p[1]}"/>
    <path d="M448 610 C420 664, 420 752, 422 836" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.42"/>
    <path d="M374 650 C324 650, 304 696, 328 734" fill="none" stroke="${p[2]}" stroke-width="14" stroke-linecap="round"/>
    <circle cx="536" cy="650" r="34" fill="${p[2]}" opacity="0.8"/>
    <path d="M540 630 C570 600, 604 610, 608 650 C574 656, 554 652, 540 630Z" fill="${p[2]}"/>
    ${person({ x: 106, y: 636, shirt: p[0], pose: "read", scale: 0.86 })}
  `;
}

function sceneWhimsy(p) {
  return `
    ${commonSceneBase(p)}
    <circle cx="548" cy="594" r="92" fill="${p[2]}" opacity="0.94"/>
    <path d="M78 804 C160 710, 250 706, 342 786 C432 864, 558 826, 642 760 V916 H78 Z" fill="${p[3]}" opacity="0.88"/>
    <path d="M78 842 C202 790, 304 820, 424 772 C504 740, 584 744, 642 710" fill="none" stroke="${p[1]}" stroke-width="12" stroke-linecap="round" opacity="0.45"/>
    ${person({ x: 140, y: 634, shirt: p[1], hair: "#8a4b23", pose: "point", scale: 0.86 })}
    <path d="M412 772 C448 706, 496 706, 532 772 C500 756, 448 756, 412 772Z" fill="${p[0]}" opacity="0.68"/>
    ${openBook(366, 808, 210, p[3], p[4])}
    <path d="M468 548c20-20 42-20 64 0M544 532c18-16 36-16 54 0" fill="none" stroke="${p[4]}" stroke-width="8" stroke-linecap="round" opacity="0.38"/>
  `;
}

function sceneClassic(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="86" y="548" width="548" height="348" rx="36" fill="${p[3]}" opacity="0.94"/>
    <path d="M176 834 C244 720, 340 686, 478 642" fill="none" stroke="${p[1]}" stroke-width="18" stroke-linecap="round"/>
    <path d="M430 622 C482 572, 560 596, 580 662 C520 676, 470 664, 430 622Z" fill="${p[1]}" opacity="0.82"/>
    <path d="M468 650 C448 708, 420 776, 366 842" fill="none" stroke="${p[4]}" stroke-width="9" stroke-linecap="round" opacity="0.32"/>
    ${person({ x: 118, y: 626, shirt: p[0], skin: "#f1c79f", pose: "read", scale: 0.88 })}
    ${openBook(330, 760, 230, "#ffffff", p[4])}
  `;
}

function sceneDetective(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="82" y="542" width="556" height="354" rx="38" fill="${p[4]}" opacity="0.88"/>
    <circle cx="434" cy="702" r="140" fill="${p[2]}" opacity="0.22"/>
    <path d="M360 838V700h46v138M424 838V652h54v186M500 838V720h50v118" fill="${p[0]}" opacity="0.92"/>
    <circle cx="248" cy="682" r="76" fill="none" stroke="${p[1]}" stroke-width="18"/>
    <path d="M304 740l86 88" stroke="${p[1]}" stroke-width="24" stroke-linecap="round"/>
    <path d="M148 822 C160 736, 196 704, 238 704 C280 704, 316 738, 326 822 Z" fill="${p[1]}" opacity="0.7"/>
    <path d="M184 668h108M206 634h62" stroke="${p[3]}" stroke-width="14" stroke-linecap="round"/>
  `;
}

function sceneGothic(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="78" y="534" width="564" height="366" rx="38" fill="${p[4]}" opacity="0.92"/>
    <circle cx="510" cy="628" r="92" fill="${p[3]}" opacity="0.72"/>
    <path d="M174 850V678l66-62l58 62v172M340 850V632l56-72l56 72v218M512 850V704l58-52l54 52v146" fill="${p[0]}"/>
    <path d="M206 748h38v78h-38zM376 710h42v116h-42zM548 760h34v66h-34z" fill="${p[2]}" opacity="0.64"/>
    <path d="M106 850h520" stroke="${p[1]}" stroke-width="18" stroke-linecap="round" opacity="0.34"/>
    <path d="M142 620 C202 572, 254 596, 292 638" fill="none" stroke="${p[3]}" stroke-width="10" stroke-linecap="round" opacity="0.28"/>
  `;
}

function sceneSea(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="76" y="540" width="568" height="354" rx="40" fill="#f4fbf8" opacity="0.9"/>
    <path d="M76 786 C146 738, 220 822, 292 774 C364 726, 434 824, 514 778 C576 742, 612 760, 644 784 V894 H76 Z" fill="${p[1]}" opacity="0.72"/>
    <path d="M110 830 C186 800, 236 860, 312 826 C388 792, 450 856, 536 824 C586 806, 622 812, 644 826" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.72"/>
    <path d="M340 648l110 90H234z" fill="${p[1]}"/>
    <path d="M342 604v144" stroke="${p[4]}" stroke-width="14" stroke-linecap="round"/>
    <path d="M358 612 C420 632, 448 676, 452 724 C410 708, 382 672, 358 612Z" fill="${p[2]}"/>
    <path d="M232 748 C306 794, 410 794, 494 748 C464 836, 284 836, 232 748Z" fill="${p[4]}"/>
    <circle cx="556" cy="620" r="48" fill="${p[2]}" opacity="0.8"/>
  `;
}

function sceneSteam(p) {
  return `
    ${commonSceneBase(p)}
    <rect x="78" y="540" width="564" height="354" rx="40" fill="#fff3df" opacity="0.9"/>
    <rect x="170" y="710" width="372" height="116" rx="30" fill="${p[0]}"/>
    <rect x="226" y="640" width="206" height="96" rx="18" fill="${p[1]}"/>
    <path d="M466 620v122M506 592v150" stroke="${p[0]}" stroke-width="28" stroke-linecap="round"/>
    <path d="M478 566 C520 526, 584 536, 614 588" fill="none" stroke="${p[2]}" stroke-width="18" stroke-linecap="round" opacity="0.62"/>
    <circle cx="244" cy="828" r="46" fill="${p[2]}"/>
    <circle cx="456" cy="828" r="46" fill="${p[2]}"/>
    <path d="M168 764h374" stroke="#ffffff" stroke-width="12" stroke-linecap="round" opacity="0.38"/>
    <path d="M116 828h516" stroke="${p[4]}" stroke-width="14" stroke-linecap="round" opacity="0.28"/>
  `;
}

function sceneForMood(mood, p) {
  const scenes = {
    study: sceneStudy,
    research: sceneResearch,
    code: sceneCode,
    data: sceneData,
    science: sceneScience,
    math: sceneMath,
    business: sceneBusiness,
    design: sceneDesign,
    craft: sceneCraft,
    whimsy: sceneWhimsy,
    classic: sceneClassic,
    detective: sceneDetective,
    gothic: sceneGothic,
    sea: sceneSea,
    steam: sceneSteam
  };

  return (scenes[mood] || sceneStudy)(p);
}

function titlePanel(book, p, mood, seed) {
  const titleLines = wrapWords(book.title, 17, 4);
  const authorLines = wrapWords(book.author, 28, 2);
  const darkPanel = ["gothic", "detective", "code", "data", "steam"].includes(mood);
  const panelFill = darkPanel ? p[4] : p[3];
  const textFill = darkPanel ? "#ffffff" : p[4];
  const labelFill = darkPanel ? p[2] : p[1];
  const titleSize = titleLines.length > 3 ? 47 : titleLines.length > 2 ? 54 : 62;
  const panelHeight = Math.max(268, 150 + titleLines.length * titleSize * 0.92 + authorLines.length * 28);
  const bottomPanel = ["whimsy", "classic", "sea", "craft"].includes(mood) || seed % 3 === 0;
  const panelY = bottomPanel ? 1040 - panelHeight - 146 : 72;
  const panelX = seed % 2 ? 72 : 56;
  const panelWidth = seed % 2 ? 520 : 552;

  return `
    <g font-family="Arial, Helvetica, sans-serif">
      <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="34" fill="${panelFill}" opacity="0.92"/>
      <rect x="${panelX + 18}" y="${panelY + 18}" width="${panelWidth - 36}" height="${panelHeight - 36}" rx="24" fill="none" stroke="${labelFill}" stroke-opacity="0.38" stroke-width="3"/>
      <text x="${panelX + 38}" y="${panelY + 70}" font-size="18" font-weight="900" fill="${labelFill}">${escapeXml(book.category || "Book")}</text>
      ${textLines(titleLines, panelX + 38, panelY + 146, titleSize, textFill)}
      <text x="${panelX + 38}" y="${panelY + panelHeight - 50}" font-size="22" font-weight="900" fill="${textFill}" opacity="0.82">${escapeXml(authorLines[0] || book.sourceName || "Read_Master")}</text>
      ${authorLines[1] ? `<text x="${panelX + 38}" y="${panelY + panelHeight - 22}" font-size="22" font-weight="900" fill="${textFill}" opacity="0.82">${escapeXml(authorLines[1])}</text>` : ""}
    </g>
  `;
}

function footerMark(book, p) {
  return `
    <g font-family="Arial, Helvetica, sans-serif">
      <rect x="78" y="910" width="126" height="72" rx="20" fill="${p[4]}" opacity="0.2" stroke="#ffffff" stroke-opacity="0.46" stroke-width="2"/>
      <text x="141" y="956" text-anchor="middle" font-size="29" font-weight="900" fill="#ffffff">${escapeXml(initials(book.title))}</text>
      <rect x="226" y="926" width="112" height="38" rx="19" fill="#ffffff" opacity="0.24"/>
      <text x="282" y="951" text-anchor="middle" font-size="18" font-weight="900" fill="#ffffff">${escapeXml(book.format || "Book")}</text>
    </g>
  `;
}

function tradeSceneForMood(mood, p, seed) {
  const base = `
    <rect x="76" y="360" width="568" height="454" rx="18" fill="${p[3]}" opacity="0.88"/>
    <rect x="98" y="382" width="524" height="410" rx="12" fill="none" stroke="${p[4]}" stroke-opacity="0.16" stroke-width="3"/>
  `;

  const scenes = {
    study: `
      ${base}
      <rect x="182" y="440" width="356" height="300" rx="20" fill="#ffffff" opacity="0.96"/>
      <rect x="214" y="482" width="292" height="204" rx="10" fill="${p[3]}" opacity="0.92"/>
      <path d="M252 538h202M252 590h174M252 642h210" stroke="${p[4]}" stroke-width="14" stroke-linecap="round" opacity="0.24"/>
      <rect x="292" y="704" width="136" height="34" rx="8" fill="${p[1]}"/>
      <path d="M506 482l46 46l-46 46" fill="none" stroke="${p[2]}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M178 440v300" stroke="${p[0]}" stroke-width="18" stroke-linecap="round" opacity="0.36"/>
    `,
    research: `
      ${base}
      <rect x="152" y="432" width="262" height="322" rx="18" fill="#ffffff" opacity="0.96"/>
      <rect x="190" y="486" width="182" height="22" rx="11" fill="${p[0]}" opacity="0.28"/>
      <rect x="190" y="548" width="150" height="22" rx="11" fill="${p[0]}" opacity="0.2"/>
      <rect x="190" y="610" width="190" height="22" rx="11" fill="${p[0]}" opacity="0.2"/>
      <circle cx="452" cy="612" r="78" fill="none" stroke="${p[1]}" stroke-width="24"/>
      <path d="M508 668l92 94" stroke="${p[1]}" stroke-width="28" stroke-linecap="round"/>
      <rect x="438" y="450" width="122" height="92" rx="16" fill="${p[2]}" opacity="0.82"/>
    `,
    code: `
      ${base}
      <rect x="128" y="430" width="464" height="280" rx="16" fill="${p[4]}"/>
      <rect x="128" y="430" width="464" height="44" rx="16" fill="${p[0]}"/>
      <circle cx="160" cy="452" r="7" fill="${p[2]}"/>
      <circle cx="184" cy="452" r="7" fill="${p[1]}"/>
      <circle cx="208" cy="452" r="7" fill="#ffffff" opacity="0.7"/>
      <text x="166" y="526" font-family="Consolas, monospace" font-size="28" font-weight="800" fill="${p[1]}">&lt;main&gt;</text>
      <text x="194" y="586" font-family="Consolas, monospace" font-size="24" font-weight="800" fill="#ffffff" opacity="0.92">display: grid;</text>
      <text x="194" y="638" font-family="Consolas, monospace" font-size="24" font-weight="800" fill="${p[2]}">const app = ready;</text>
      <path d="M178 754h364" stroke="${p[1]}" stroke-width="18" stroke-linecap="round" opacity="0.46"/>
      <path d="M474 514l54 54l-54 54M246 514l-54 54l54 54" fill="none" stroke="${p[2]}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    data: `
      ${base}
      <rect x="186" y="480" width="348" height="232" rx="20" fill="${p[4]}" opacity="0.94"/>
      <path d="M286 512v-54c0-52 38-86 80-86s80 34 80 86v54" fill="none" stroke="${p[1]}" stroke-width="30" stroke-linecap="round"/>
      <rect x="252" y="512" width="228" height="164" rx="18" fill="${p[0]}"/>
      <circle cx="366" cy="584" r="28" fill="${p[2]}"/>
      <path d="M366 612v42" stroke="${p[2]}" stroke-width="15" stroke-linecap="round"/>
      <ellipse cx="166" cy="716" rx="58" ry="20" fill="${p[1]}" opacity="0.62"/>
      <path d="M108 626c0 14 116 14 116 0v90c0 14-116 14-116 0z" fill="${p[1]}" opacity="0.34"/>
      <ellipse cx="554" cy="432" rx="58" ry="20" fill="${p[2]}" opacity="0.7"/>
      <path d="M496 432c0 14 116 14 116 0v110c0 14-116 14-116 0z" fill="${p[2]}" opacity="0.34"/>
    `,
    science: `
      ${base}
      <circle cx="472" cy="534" r="112" fill="${p[0]}" opacity="0.18"/>
      <path d="M472 422c54 58 54 166 0 224M472 422c-54 58-54 166 0 224M374 534h196" fill="none" stroke="${p[1]}" stroke-width="10" stroke-linecap="round"/>
      <circle cx="472" cy="534" r="112" fill="none" stroke="${p[0]}" stroke-width="14"/>
      <path d="M240 682h174l-58-162h-58z" fill="${p[1]}"/>
      <path d="M276 640h104" stroke="#ffffff" stroke-width="13" stroke-linecap="round" opacity="0.75"/>
      <path d="M318 520v-84h82" stroke="${p[4]}" stroke-width="14" stroke-linecap="round"/>
      <path d="M426 686 C482 620 552 638 590 716 C516 736 464 726 426 686Z" fill="${p[2]}" opacity="0.9"/>
    `,
    business: `
      ${base}
      <rect x="154" y="502" width="324" height="184" rx="22" fill="${p[4]}" opacity="0.9"/>
      <rect x="184" y="466" width="356" height="208" rx="24" fill="${p[3]}"/>
      <path d="M246 624V560M318 624V516M390 624V548M462 624V488" stroke="${p[0]}" stroke-width="34" stroke-linecap="round"/>
      <path d="M232 552c64-18 84-68 136-46c44 18 64-46 108-62" fill="none" stroke="${p[1]}" stroke-width="15" stroke-linecap="round"/>
      <circle cx="530" cy="712" r="50" fill="${p[1]}"/>
      <circle cx="468" cy="746" r="42" fill="${p[2]}"/>
      <path d="M510 712h40M450 746h34" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>
    `,
    classic: `
      ${base}
      <rect x="138" y="492" width="444" height="220" rx="18" fill="${p[3]}" opacity="0.94"/>
      <path d="M154 532 C250 486, 318 512, 360 578 V722 C300 672, 220 662, 154 706 Z" fill="#ffffff"/>
      <path d="M360 578 C416 510, 494 486, 566 532 V706 C492 662, 424 672, 360 722 Z" fill="#fffaf0"/>
      <path d="M360 580v142" stroke="${p[4]}" stroke-width="8" stroke-linecap="round" opacity="0.28"/>
      <path d="M196 570h116M196 616h132M414 570h104M414 616h118" stroke="${p[4]}" stroke-width="10" stroke-linecap="round" opacity="0.2"/>
      <rect x="212" y="742" width="296" height="22" rx="11" fill="${p[1]}" opacity="0.56"/>
      <path d="M506 418 C556 370, 612 398, 630 460 C570 476, 530 462, 506 418Z" fill="${p[1]}" opacity="0.72"/>
    `,
    design: `
      ${base}
      <rect x="216" y="424" width="288" height="330" rx="34" fill="${p[4]}"/>
      <rect x="244" y="470" width="232" height="228" rx="20" fill="#ffffff"/>
      <rect x="276" y="510" width="132" height="18" rx="9" fill="${p[1]}"/>
      <rect x="276" y="558" width="160" height="18" rx="9" fill="${p[0]}" opacity="0.28"/>
      <rect x="276" y="606" width="86" height="54" rx="14" fill="${p[2]}"/>
      <circle cx="526" cy="462" r="54" fill="${p[2]}" opacity="0.72"/>
      <rect x="142" y="676" width="78" height="78" rx="16" fill="${p[1]}"/>
      <rect x="520" y="678" width="58" height="58" rx="14" fill="${p[0]}" opacity="0.72"/>
    `,
    craft: `
      ${base}
      <rect x="180" y="448" width="360" height="286" rx="18" fill="#ffffff" opacity="0.94"/>
      <path d="M232 646 C294 548, 400 532, 486 622 C432 706, 310 726, 232 646Z" fill="${p[1]}" opacity="0.72"/>
      <path d="M252 642 C322 606, 392 606, 466 642" fill="none" stroke="${p[4]}" stroke-width="11" stroke-linecap="round" opacity="0.28"/>
      <circle cx="302" cy="560" r="42" fill="${p[2]}" opacity="0.72"/>
      <circle cx="438" cy="706" r="32" fill="${p[2]}" opacity="0.58"/>
      <path d="M530 452l54 160M562 452l-54 160" stroke="${p[4]}" stroke-width="12" stroke-linecap="round" opacity="0.38"/>
    `,
    math: `
      ${base}
      <g transform="translate(180 438)">
        ${Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => {
          const fill = (row + col) % 2 ? p[0] : p[3];
          return `<rect x="${col * 34}" y="${row * 34}" width="34" height="34" fill="${fill}" opacity="${(row + col) % 2 ? 0.84 : 0.95}"/>`;
        }).join("")).join("")}
      </g>
      <circle cx="486" cy="666" r="74" fill="${p[1]}" opacity="0.92"/>
      <path d="M448 666h76M486 628v76" stroke="#ffffff" stroke-width="15" stroke-linecap="round"/>
      <text x="186" y="754" font-family="Georgia, serif" font-size="46" font-weight="900" fill="${p[4]}">x + y = 1</text>
    `,
    gothic: `
      ${base}
      <circle cx="516" cy="462" r="92" fill="${p[3]}" opacity="0.7"/>
      <path d="M116 760V594l72-74l62 74v166M300 760V520l60-86l62 86v240M512 760V620l62-54l54 54v140" fill="${p[4]}"/>
      <path d="M154 660h42v82h-42zM340 610h42v132h-42zM548 676h34v66h-34z" fill="${p[2]}" opacity="0.52"/>
      <path d="M104 764h520" stroke="${p[1]}" stroke-width="18" stroke-linecap="round"/>
      <path d="M130 514c58-54 122-50 174 12" fill="none" stroke="${p[3]}" stroke-width="9" stroke-linecap="round" opacity="0.32"/>
    `,
    detective: `
      ${base}
      <path d="M144 726V522h64v204M238 726V458h74v268M344 726V552h58v174M438 726V496h82v230" fill="${p[4]}" opacity="0.9"/>
      <circle cx="300" cy="562" r="92" fill="none" stroke="${p[1]}" stroke-width="22"/>
      <path d="M368 628l112 118" stroke="${p[1]}" stroke-width="28" stroke-linecap="round"/>
      <path d="M156 784h394" stroke="${p[2]}" stroke-width="16" stroke-linecap="round" opacity="0.68"/>
      <rect x="484" y="420" width="86" height="132" rx="10" fill="${p[2]}" opacity="0.32"/>
    `,
    sea: `
      ${base}
      <path d="M76 660 C154 606 226 704 304 650 C386 592 456 704 536 654 C590 620 620 636 644 658 V814 H76 Z" fill="${p[1]}" opacity="0.78"/>
      <path d="M104 710 C190 674 244 744 330 706 C410 670 472 742 560 706 C604 688 626 694 644 704" fill="none" stroke="#ffffff" stroke-width="15" stroke-linecap="round" opacity="0.72"/>
      <path d="M356 520l118 96H238z" fill="${p[2]}"/>
      <path d="M358 462v166" stroke="${p[4]}" stroke-width="14" stroke-linecap="round"/>
      <path d="M372 470 C436 494 466 544 474 600 C424 582 394 534 372 470Z" fill="${p[3]}" opacity="0.9"/>
      <path d="M246 642 C312 704 420 704 498 642 C476 744 278 744 246 642Z" fill="${p[4]}"/>
    `,
    steam: `
      ${base}
      <circle cx="276" cy="626" r="106" fill="none" stroke="${p[4]}" stroke-width="30"/>
      <circle cx="276" cy="626" r="34" fill="${p[1]}"/>
      <path d="M276 500v252M150 626h252M188 538l176 176M364 538L188 714" stroke="${p[4]}" stroke-width="16" stroke-linecap="round" opacity="0.82"/>
      <rect x="410" y="512" width="136" height="170" rx="18" fill="${p[0]}"/>
      <path d="M560 476v210M598 442v244" stroke="${p[4]}" stroke-width="28" stroke-linecap="round"/>
      <path d="M548 410c54-50 116-26 132 36" fill="none" stroke="${p[2]}" stroke-width="18" stroke-linecap="round" opacity="0.58"/>
    `,
    whimsy: `
      ${base}
      <circle cx="360" cy="602" r="150" fill="${p[2]}" opacity="0.94"/>
      <path d="M266 534c42-72 110-88 170-38c60 50 66 136 10 204c-48 60-138 76-202 24c-58-46-60-124 22-190z" fill="${p[2]}"/>
      <path d="M430 414 C494 356 580 382 606 456 C532 476 468 464 430 414Z" fill="${p[0]}" opacity="0.72"/>
      <path d="M454 438 C418 500 396 556 376 638" stroke="${p[4]}" stroke-width="10" stroke-linecap="round" opacity="0.32"/>
      <path d="M154 748 C236 688 304 714 384 672 C454 634 528 648 594 602" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.7"/>
    `
  };

  return scenes[mood] || `
    ${base}
    <rect x="148" y="466" width="390" height="262" rx="16" fill="${p[3]}"/>
    <path d="M188 514h310M188 574h248M188 634h286" stroke="${p[4]}" stroke-width="18" stroke-linecap="round" opacity="0.22"/>
    <rect x="214" y="688" width="252" height="54" rx="12" fill="${p[1]}" opacity="0.84"/>
    <path d="M492 434l74 74l-74 74" fill="none" stroke="${p[2]}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function tradeTypography(book, p, mood, seed) {
  const titleLines = wrapWords(book.title, 15, 4);
  const authorLines = wrapWords(book.author || book.sourceName || "Read_Master", 32, 2);
  const darkCover = ["code", "data", "gothic", "detective", "sea", "steam"].includes(mood);
  const titleFill = darkCover ? "#ffffff" : p[4];
  const subtitleFill = darkCover ? "#f4fbf8" : p[0];
  const panelFill = darkCover ? p[4] : p[3];
  const longestTitleLine = Math.max(...titleLines.map((line) => line.length), 1);
  const baseTitleSize = titleLines.length > 3 ? 45 : titleLines.length > 2 ? 52 : 62;
  const fitTitleSize = Math.floor(526 / (longestTitleLine * 0.58));
  const titleSize = Math.max(38, Math.min(baseTitleSize, fitTitleSize));
  const titleStartY = 184;
  const titleStep = titleSize * 0.98;
  const titleBottom = titleStartY + (titleLines.length - 1) * titleStep;
  const subtitleLines = titleLines.length <= 2
    ? wrapWords(book.description || "A curated Read_Master resource.", 46, titleLines.length === 1 ? 2 : 1)
    : [];
  const subtitleY = titleBottom + titleSize * 0.54 + 26;

  return `
    <g font-family="Georgia, 'Times New Roman', serif">
      <rect x="66" y="58" width="588" height="306" rx="14" fill="${panelFill}" opacity="0.94"/>
      <rect x="88" y="82" width="544" height="258" rx="8" fill="none" stroke="${darkCover ? p[1] : p[0]}" stroke-opacity="0.22" stroke-width="3"/>
      <text x="106" y="124" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="900" letter-spacing="2" fill="${darkCover ? p[2] : p[1]}">${escapeXml(book.category || "Book")}</text>
      ${textLines(titleLines, 106, titleStartY, titleSize, titleFill, 900, 0.98)}
      ${subtitleLines.map((line, index) => `<text x="106" y="${subtitleY + index * 26}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="${subtitleFill}" opacity="0.82">${escapeXml(line)}</text>`).join("\n")}
      <text x="94" y="934" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900" fill="${darkCover ? "#ffffff" : p[4]}">${escapeXml(authorLines[0])}</text>
      ${authorLines[1] ? `<text x="94" y="966" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900" fill="${darkCover ? "#ffffff" : p[4]}">${escapeXml(authorLines[1])}</text>` : ""}
      <text x="626" y="958" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="900" fill="${darkCover ? "#ffffff" : p[4]}" opacity="0.7">READ_MASTER</text>
    </g>
  `;
}

function comingSoonSeal(book, p) {
  if (String(book.status || "").toLowerCase() !== "upcoming") return "";

  return `
    <g transform="translate(414 808) rotate(-8)" font-family="Arial, Helvetica, sans-serif">
      <rect x="0" y="0" width="222" height="64" rx="8" fill="${p[2]}" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3"/>
      <text x="111" y="41" text-anchor="middle" font-size="24" font-weight="900" fill="${p[4]}">COMING SOON</text>
    </g>
  `;
}

function coverSvg(book) {
  const mood = moodForBook(book);
  const p = palettes[mood] || palettes.study;
  const seed = hashText(`${book.id}-${book.title}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1040" viewBox="0 0 720 1040" role="img" aria-label="${escapeXml(book.title)} cover">
  <defs>
    <linearGradient id="cover-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${p[0]}"/>
      <stop offset="52%" stop-color="${p[1]}"/>
      <stop offset="100%" stop-color="${p[2]}"/>
    </linearGradient>
    <radialGradient id="cover-glow" cx="${seed % 2 ? "78%" : "22%"}" cy="18%" r="68%">
      <stop offset="0%" stop-color="${p[3]}" stop-opacity="0.44"/>
      <stop offset="100%" stop-color="${p[3]}" stop-opacity="0"/>
    </radialGradient>
    <filter id="paper">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.08"/>
      </feComponentTransfer>
    </filter>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0b2d1d" flood-opacity="0.24"/>
    </filter>
  </defs>
  <rect width="720" height="1040" rx="22" fill="url(#cover-bg)"/>
  <rect width="720" height="1040" rx="22" fill="url(#cover-glow)"/>
  <rect width="720" height="1040" rx="22" filter="url(#paper)" opacity="0.52"/>
  <rect x="34" y="34" width="652" height="972" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="3"/>
  <path d="M0 0h62v1040H0z" fill="#071d14" opacity="0.26"/>
  <path d="M62 0h12v1040H62z" fill="#ffffff" opacity="0.2"/>
  <path d="M0 806 C172 742 276 824 438 758 C562 708 650 724 720 672 V1040 H0 Z" fill="${p[4]}" opacity="${seed % 2 ? "0.18" : "0.1"}"/>
  <g filter="url(#soft-shadow)">
    ${tradeSceneForMood(mood, p, seed)}
  </g>
  ${tradeTypography(book, p, mood, seed)}
  ${comingSoonSeal(book, p)}
</svg>`;
}

await mkdir(coverDir, { recursive: true });

await Promise.all(sampleBooks.map((book) => {
  const output = resolve(coverDir, `${book.id}.svg`);
  return writeFile(output, coverSvg(book), "utf8");
}));

console.log(`Generated ${sampleBooks.length} trade-style covers in public/assets/covers.`);

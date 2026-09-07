import { getBook, getCachedBook, isPublicBook } from "./firebase-service.js";
import { isBookSaved, toggleSavedBook } from "./reading-store.js";
import { $, categoryTone, escapeAttribute, escapeHtml, formatDate, getQueryParam, initialsFromTitle } from "./utils.js";

const bookId = getQueryParam("id");
const detailCover = $("#detailCover");
const detailInitials = $("#detailInitials");
const detailCategory = $("#detailCategory");
const detailTitle = $("#detailTitle");
const detailMeta = $("#detailMeta");
const detailDescription = $("#detailDescription");
const detailFormat = $("#detailFormat");
const detailLanguage = $("#detailLanguage");
const detailReleaseDate = $("#detailReleaseDate");
const detailLicense = $("#detailLicense");
const previewResourceButton = $("#previewResourceButton");
const downloadResourceButton = $("#downloadResourceButton");
const resourceReader = $("#resourceReader");
const resourceFrame = $("#resourceFrame");
const readerTitle = $("#readerTitle");
const readerDownloadButton = $("#readerDownloadButton");
const saveBookButton = $("#saveBookButton");

let currentBook = null;

const demoPreviewSections = {
  "readmaster-study-skills-starter": [
    {
      heading: "Why Study Systems Help",
      points: [
        "A study system lowers stress because you do not need to decide what to do every time you sit down.",
        "Good systems are small. They tell you what to read, what to write, and when to review.",
        "The aim is steady progress, not a perfect day."
      ]
    },
    {
      heading: "A Simple Weekly Plan",
      points: [
        "Choose three focus blocks for difficult subjects.",
        "Keep short review sessions between bigger work sessions.",
        "End each week by writing what felt clear and what still feels confusing."
      ]
    },
    {
      heading: "Active Reading",
      points: [
        "Preview headings before reading the full page.",
        "Write one question before each section.",
        "After reading, close the page and explain the main idea in your own words."
      ]
    }
  ],
  "readmaster-gentle-coding-basics": [
    {
      heading: "What Code Does",
      points: [
        "Code is a set of instructions that a computer follows exactly.",
        "Most bugs happen because the instruction is incomplete, in the wrong order, or using unexpected data.",
        "Learning code is learning how to describe your idea clearly."
      ]
    },
    {
      heading: "Files And Folders",
      points: [
        "HTML gives structure, CSS gives style, and JavaScript gives behavior.",
        "Keep related files named clearly so future you can find them quickly.",
        "A small project is easier to improve when each file has one main job."
      ]
    },
    {
      heading: "Debugging Calmly",
      points: [
        "Read the error message from top to bottom.",
        "Check the file name and line number before changing many things.",
        "Make one change, test it, and keep notes when you learn something."
      ]
    }
  ],
  "readmaster-digital-research-workbook": [
    {
      heading: "Source Quality",
      points: [
        "A useful source has an author, a date, a publisher, and a reason to trust it.",
        "Official documentation, academic institutions, public libraries, and open education projects are strong starting points.",
        "A source can be interesting without being reliable enough for your assignment."
      ]
    },
    {
      heading: "Research Log",
      points: [
        "Save the title, link, author, date accessed, and one sentence about why the source matters.",
        "Separate facts from opinions in your notes.",
        "Mark questions that still need another source."
      ]
    },
    {
      heading: "Compare Before Using",
      points: [
        "Check whether two independent sources agree.",
        "Look for the original report instead of only reading summaries.",
        "Be careful with copied PDFs that do not show permission or license information."
      ]
    }
  ],
  "readmaster-accessibility-pocket-guide": [
    {
      heading: "Readable Text",
      points: [
        "Use enough contrast between text and background.",
        "Avoid making important text too small.",
        "Keep line length comfortable so readers do not lose their place."
      ]
    },
    {
      heading: "Controls",
      points: [
        "Buttons should look clickable and say what they do.",
        "Inputs need visible labels, not only placeholder text.",
        "Keyboard users should be able to reach every important action."
      ]
    },
    {
      heading: "Layout",
      points: [
        "Group related items close together.",
        "Do not rely on color alone to explain meaning.",
        "Check small screens because cramped layouts create avoidable mistakes."
      ]
    }
  ],
  "readmaster-data-ethics-starter": [
    {
      heading: "Data Has People Behind It",
      points: [
        "A spreadsheet can describe real people, habits, risks, and opportunities.",
        "Treat personal data with respect even when the data looks ordinary.",
        "Ask whether collecting the data is necessary before asking how to collect it."
      ]
    },
    {
      heading: "Consent And Purpose",
      points: [
        "People should understand what data is collected and why.",
        "Do not reuse data for a new purpose without checking permission.",
        "Keep privacy settings clear and easy to find."
      ]
    },
    {
      heading: "Bias",
      points: [
        "Data can reflect unfair systems, missing voices, or old assumptions.",
        "Check whose data is included and whose data is missing.",
        "A fair system needs testing, feedback, and willingness to change."
      ]
    }
  ],
  "readmaster-personal-finance-notes": [
    {
      heading: "Know Your Flow",
      points: [
        "Money planning begins with knowing what comes in and what goes out.",
        "Track spending for one week without judging yourself.",
        "Patterns are more useful than guesses."
      ]
    },
    {
      heading: "Budget Basics",
      points: [
        "Give every important expense a simple category.",
        "Set aside money for needs before wants.",
        "A budget is a plan you can adjust, not a punishment."
      ]
    },
    {
      heading: "Saving Goals",
      points: [
        "Choose one short goal that can be reached within a month.",
        "Make the first step small enough to start today.",
        "Celebrate consistency more than amount."
      ]
    }
  ],
  "readmaster-climate-science-reader": [
    {
      heading: "Climate And Weather",
      points: [
        "Weather is what happens over hours or days.",
        "Climate is the pattern measured over many years.",
        "Both matter, but they answer different questions."
      ]
    },
    {
      heading: "Evidence",
      points: [
        "Scientists use temperature records, ice cores, oceans, satellites, and ecosystems.",
        "One measurement can be noisy, but many measurements can show a pattern.",
        "Good science keeps checking the pattern with new data."
      ]
    },
    {
      heading: "Systems",
      points: [
        "Air, oceans, land, ice, plants, and people all interact.",
        "A change in one part of the system can affect another part later.",
        "This is why climate learning needs patience and careful comparison."
      ]
    }
  ],
  "readmaster-creative-writing-prompts": [
    {
      heading: "Character",
      points: [
        "Write about someone who keeps a secret for a kind reason.",
        "Give the character one habit, one fear, and one object they always carry.",
        "Let the object become important before the end of the scene."
      ]
    },
    {
      heading: "Setting",
      points: [
        "Describe a library after closing time.",
        "Use three sounds, two textures, and one smell.",
        "Make the place feel calm at first, then add one strange detail."
      ]
    },
    {
      heading: "Conflict",
      points: [
        "Give two characters the same goal for different reasons.",
        "Let both sides be understandable.",
        "End the scene before the argument is fully solved."
      ]
    }
  ]
};

const demoPreviewParagraphs = {
  "readmaster-study-skills-starter": {
    "Why Study Systems Help": [
      "Studying feels easier when the next step is already clear. A simple system gives your reading time a shape, so you can begin without spending extra energy deciding what to do first.",
      "The system does not need to be strict. It only needs to help you return to the work, notice what you understand, and keep the difficult parts visible for later review."
    ],
    "A Simple Weekly Plan": [
      "Start by choosing a few small focus blocks for the week. Put the hardest subject earlier in the day if possible, then use shorter review sessions to keep older material warm.",
      "At the end of the week, write two lists: what became clearer, and what still feels confusing. Those two lists become the plan for your next study cycle."
    ],
    "Active Reading": [
      "Active reading means you talk back to the page. Before reading, turn headings into questions. During reading, look for answers. After reading, explain the idea without copying the exact sentence.",
      "This habit helps you remember because your brain has to organize the idea, not only recognize it."
    ]
  },
  "readmaster-gentle-coding-basics": {
    "What Code Does": [
      "Code is a way to describe a task clearly enough for a computer to repeat it. The computer does not guess your meaning, so small details like order, spelling, and missing values matter.",
      "When you are new, do not rush to memorize everything. Focus on reading one line, asking what it expects, and checking what it produces."
    ],
    "Files And Folders": [
      "A small web project usually has three main jobs. HTML describes the content, CSS controls the visual style, and JavaScript handles actions such as clicking, filtering, saving, or loading data.",
      "Keeping these jobs separated makes your project easier to understand when you return to it later."
    ],
    "Debugging Calmly": [
      "Debugging is not guessing wildly. First read the message, then check the file and line number, then make one small change. If the problem changes, you learned something useful.",
      "Good developers are not people who never see errors. They are people who know how to slow down and follow the clues."
    ]
  },
  "readmaster-digital-research-workbook": {
    "Source Quality": [
      "A strong source makes it easy to understand who created it, when it was updated, and why it should be trusted. If those details are missing, pause before using it in important work.",
      "Reliable research often starts with official documentation, universities, libraries, public data projects, and open education collections."
    ],
    "Research Log": [
      "A research log saves you from losing good sources. Record the title, link, author, access date, and one sentence explaining why the source matters to your topic.",
      "When your notes separate facts from opinions, it becomes easier to build an argument without mixing evidence and personal reaction."
    ],
    "Compare Before Using": [
      "One useful source is a start, not the finish. Compare the claim with another independent source and look for the original report whenever possible.",
      "This habit protects your work from copied summaries, old information, and pages that sound confident but do not show evidence."
    ]
  },
  "readmaster-accessibility-pocket-guide": {
    "Readable Text": [
      "Readable text helps everyone, not only people with permanent vision difficulties. Good contrast, comfortable spacing, and clear font sizes make reading less tiring on phones, laptops, and bright screens.",
      "If the reader has to zoom immediately, the design is asking them to solve a problem that the interface should have solved first."
    ],
    "Controls": [
      "A control should look clickable and clearly state what will happen. Labels, focus states, and button text are small details that prevent confusion.",
      "Keyboard access is also part of the experience. If a user cannot tab to an action, that action is not truly available to everyone."
    ],
    "Layout": [
      "A calm layout groups related ideas together and gives enough space between different tasks. Readers should be able to scan the page and understand where to begin.",
      "Do not use color as the only signal. Text, icons, labels, and layout should also explain the meaning."
    ]
  },
  "readmaster-data-ethics-starter": {
    "Data Has People Behind It": [
      "Data can look like rows, numbers, charts, or anonymous IDs, but many datasets describe real people. A careless feature can expose private details or make unfair decisions feel automatic.",
      "Ethical data work begins before coding. Ask whether the data is necessary, who benefits from collecting it, and who could be harmed if it is wrong."
    ],
    "Consent And Purpose": [
      "People should understand what is being collected and why. If data was gathered for one purpose, reusing it for another purpose can break trust.",
      "Clear explanations and simple privacy controls help users feel respected instead of watched."
    ],
    "Bias": [
      "Bias can enter a system through missing data, old assumptions, or decisions that only work well for one group of people.",
      "Testing should ask whose experience is missing. Feedback and correction are part of building a fairer system."
    ]
  },
  "readmaster-personal-finance-notes": {
    "Know Your Flow": [
      "Before changing your money habits, notice what is already happening. Write down what comes in, what goes out, and which spending choices repeat every week.",
      "This step is not for blaming yourself. It is for replacing guesses with a clear picture, because clear information makes calmer decisions possible."
    ],
    "Budget Basics": [
      "A budget is only useful if you can live with it. Start with needs, then regular commitments, then wants. Leave a little room for real life so one imperfect week does not break the whole plan.",
      "The best budget is not the most beautiful spreadsheet. It is the plan you can actually check and adjust."
    ],
    "Saving Goals": [
      "Small goals build confidence faster than vague promises. Choose one target you can reach soon, such as saving for a book, transport, software, or an emergency buffer.",
      "When the goal is specific, every small deposit feels connected to something real."
    ]
  },
  "readmaster-climate-science-reader": {
    "Climate And Weather": [
      "Weather describes short-term conditions like today’s rain, heat, or wind. Climate describes long-term patterns measured across many years.",
      "This difference matters because one hot day does not prove a trend, and one cold day does not erase one."
    ],
    "Evidence": [
      "Climate evidence comes from many places: thermometers, satellites, oceans, ice, plants, and historical records. Each source has limits, but together they help show larger patterns.",
      "Good science keeps comparing measurements and updating explanations when stronger evidence appears."
    ],
    "Systems": [
      "The climate system is connected. Air, oceans, ice, land, plants, cities, and human choices all affect one another in direct and indirect ways.",
      "Learning the system slowly helps big problems become easier to discuss and understand."
    ]
  },
  "readmaster-creative-writing-prompts": {
    "Character": [
      "A character becomes interesting when they want something, fear something, and make choices under pressure. Even a short scene can feel alive when the reader understands what matters to the character.",
      "Try giving the character one object they carry everywhere. Then let that object reveal a memory, habit, or secret."
    ],
    "Setting": [
      "A setting is more than a background. Sound, texture, smell, and light can change the mood before any character speaks.",
      "Use a few concrete details instead of explaining everything. Let the reader feel the place through small observations."
    ],
    "Conflict": [
      "Conflict works best when both sides have a reason. If each character wants something understandable, the scene becomes more human and less predictable.",
      "You do not need to solve the conflict immediately. Sometimes stopping before the answer creates the strongest reason to keep reading."
    ]
  }
};

function resourceUrlFor(book) {
  return String(book?.resourceUrl || "").trim();
}

function isPdfResource(book) {
  const resourceUrl = resourceUrlFor(book);
  if (!resourceUrl) return false;

  try {
    const pathname = decodeURIComponent(new URL(resourceUrl, window.location.href).pathname).toLowerCase();
    return pathname.endsWith(".pdf") || pathname.includes(".pdf/");
  } catch (error) {
    return resourceUrl.split(/[?#]/)[0].toLowerCase().endsWith(".pdf");
  }
}

function isPublishedBook(book) {
  return String(book?.status || "published").toLowerCase() === "published";
}

function canPreviewPdf(book) {
  return isPublishedBook(book) && isPdfResource(book);
}

function downloadNameFor(book) {
  const slug = String(book?.title || "read-master-book")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "read-master-book"}.pdf`;
}

function setDownloadLink(element, book) {
  element.href = resourceUrlFor(book);
  element.download = downloadNameFor(book);
}

function fallbackPreviewSections(book) {
  return [
    {
      heading: "Sample Reading",
      paragraphs: [
        book.description || "This resource is available as part of the Read_Master catalog.",
        "Read this short preview first. If the topic is useful, download the PDF for the complete resource."
      ]
    },
    {
      heading: "What To Check",
      points: [
        "Does the topic match what you want to learn?",
        "Is the level comfortable for your current study?",
        "Will the examples or notes help you after reading?"
      ]
    }
  ];
}

function previewConclusion(book) {
  const conclusions = {
    "readmaster-study-skills-starter": "Good study habits do not need to be complicated. Start with one clear plan, read with questions in mind, and review small parts often.",
    "readmaster-gentle-coding-basics": "Coding becomes easier when you keep projects small, test one change at a time, and treat errors as clues instead of failure.",
    "readmaster-digital-research-workbook": "Strong research comes from careful source checking, organized notes, and comparing evidence before using it in your work.",
    "readmaster-accessibility-pocket-guide": "Accessible design helps more people use your work comfortably. Clear text, reachable controls, and simple layouts already make a big difference.",
    "readmaster-data-ethics-starter": "Data work should stay thoughtful because real people can be affected by every collection, storage, and design decision.",
    "readmaster-personal-finance-notes": "Money confidence grows from small repeatable habits. Track the flow first, choose one useful change, and keep the plan flexible.",
    "readmaster-climate-science-reader": "Climate learning is about patterns, evidence, and connected systems. Careful comparison helps turn big topics into understandable ideas.",
    "readmaster-creative-writing-prompts": "Story practice improves when you write often, build specific details, and let characters want something clearly."
  };

  return conclusions[book.id] || `This preview gives a quick sense of ${book.title}. Download the PDF if the content matches your reading goal.`;
}

function renderSectionBody(section) {
  const paragraphs = section.paragraphs?.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") || "";
  const points = section.points?.length ? `
    <ul>
      ${section.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
    </ul>
  ` : "";

  return `${paragraphs}${points}`;
}

function renderPreviewContent(book) {
  const previewSections = demoPreviewSections[book.id] || fallbackPreviewSections(book);
  const sections = [
    ...previewSections.map((section) => ({
      ...section,
      paragraphs: section.paragraphs || demoPreviewParagraphs[book.id]?.[section.heading] || []
    })),
    {
      heading: "Conclusion",
      paragraphs: [previewConclusion(book)]
    }
  ];

  const sectionMarkup = sections.map((section, index) => `
    <article class="reader-page">
      <span class="reader-page-number">${String(index + 1).padStart(2, "0")}</span>
      <h3>${escapeHtml(section.heading)}</h3>
      ${renderSectionBody(section)}
    </article>
  `).join("");

  return `
    <div class="reader-pages">
      ${sectionMarkup}
    </div>
  `;
}

function hideReader() {
  resourceReader.hidden = true;
  resourceFrame.innerHTML = "";
}

function showReader() {
  if (!currentBook || !canPreviewPdf(currentBook)) return;

  readerTitle.textContent = currentBook.title;
  setDownloadLink(readerDownloadButton, currentBook);
  resourceFrame.innerHTML = renderPreviewContent(currentBook);
  resourceReader.hidden = false;
  resourceReader.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openResourceInNewTab() {
  const resourceUrl = resourceUrlFor(currentBook);
  if (!resourceUrl) return;

  const popup = window.open(resourceUrl, "_blank", "noopener");
  if (popup) popup.opener = null;
}

function renderBook(book) {
  currentBook = book;
  document.title = `${book.title} | Read_Master Library`;

  detailCover.style.setProperty("--cover-bg", categoryTone(book.category));
  detailCover.innerHTML = book.coverUrl
    ? `<img src="${escapeAttribute(book.coverUrl)}" alt="${escapeAttribute(book.title)} cover">`
    : `<span class="cover-initials" id="detailInitials">${escapeHtml(initialsFromTitle(book.title))}</span>`;

  detailCategory.textContent = book.category;
  detailTitle.textContent = book.title;
  detailMeta.textContent = `${book.author}${book.sourceName ? ` - ${book.sourceName}` : ""}`;
  detailDescription.textContent = book.description;
  detailFormat.textContent = book.format;
  detailLanguage.textContent = book.language || "-";
  detailReleaseDate.textContent = formatDate(book.releaseDate);
  detailLicense.textContent = book.licenseType || "-";

  const hasResource = Boolean(resourceUrlFor(book));
  const hasPdfPreview = canPreviewPdf(book);

  hideReader();

  if (hasResource && isPublishedBook(book)) {
    previewResourceButton.hidden = false;
    previewResourceButton.disabled = false;
    previewResourceButton.textContent = hasPdfPreview ? "Read Preview" : "Open Source";
  } else {
    previewResourceButton.hidden = false;
    previewResourceButton.disabled = true;
    previewResourceButton.textContent = book.status === "upcoming" ? "Coming Soon" : "No Resource Link";
  }

  if (hasPdfPreview) {
    setDownloadLink(downloadResourceButton, book);
    downloadResourceButton.hidden = false;
  } else {
    downloadResourceButton.hidden = true;
    downloadResourceButton.href = "#";
    downloadResourceButton.removeAttribute("download");
  }

  saveBookButton.textContent = isBookSaved(book.id) ? "Saved" : "Save Book";
  saveBookButton.classList.toggle("saved", isBookSaved(book.id));
}

function renderMissing(message) {
  detailInitials.textContent = "NA";
  detailCategory.textContent = "Not found";
  detailTitle.textContent = message;
  detailMeta.textContent = "";
  detailDescription.textContent = "Return to the library and select another resource.";
  previewResourceButton.hidden = true;
  downloadResourceButton.hidden = true;
  saveBookButton.hidden = true;
  hideReader();
}

previewResourceButton.addEventListener("click", () => {
  if (!currentBook) return;
  if (canPreviewPdf(currentBook)) {
    showReader();
    return;
  }

  if (isPublishedBook(currentBook)) openResourceInNewTab();
});

saveBookButton.addEventListener("click", () => {
  if (!currentBook) return;
  toggleSavedBook(currentBook.id);
  renderBook(currentBook);
});

async function initDetails() {
  if (!bookId) {
    renderMissing("No book selected.");
    return;
  }

  const cachedBook = getCachedBook(bookId);
  const hasCachedPublicBook = isPublicBook(cachedBook);

  if (hasCachedPublicBook) {
    renderBook(cachedBook);
  }

  try {
    const book = await getBook(bookId);
    if (!isPublicBook(book)) {
      if (!hasCachedPublicBook) renderMissing("Book not found.");
      return;
    }

    renderBook(book);
  } catch (error) {
    if (!hasCachedPublicBook) renderMissing(error.message);
  }
}

initDetails();

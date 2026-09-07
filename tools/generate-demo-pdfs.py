from pathlib import Path
import textwrap

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
BOOK_DIR = ROOT / "public" / "assets" / "books"

BOOKS = [
    {
        "id": "readmaster-study-skills-starter",
        "title": "Study Skills Starter",
        "subtitle": "Plan better, read actively, review calmly.",
        "category": "Education",
        "color": "#123d2a",
        "accent": "#c99a3e",
        "sections": [
            ("Why Study Systems Help", [
                "A study system lowers stress because you do not need to decide what to do every time you sit down.",
                "Good systems are small. They tell you what to read, what to write, and when to review.",
                "The aim is steady progress, not a perfect day."
            ]),
            ("A Simple Weekly Plan", [
                "Choose three focus blocks for difficult subjects.",
                "Keep short review sessions between bigger work sessions.",
                "End each week by writing what felt clear and what still feels confusing."
            ]),
            ("Active Reading", [
                "Preview headings before reading the full page.",
                "Write one question before each section.",
                "After reading, close the page and explain the main idea in your own words."
            ]),
            ("Quick Practice", [
                "Pick one chapter and make five questions from the headings.",
                "Read for fifteen minutes, then answer your own questions without looking.",
                "Save the hardest question for your next study session."
            ])
        ]
    },
    {
        "id": "readmaster-gentle-coding-basics",
        "title": "Gentle Coding Basics",
        "subtitle": "Tiny habits for learning how software works.",
        "category": "Technology",
        "color": "#174f3a",
        "accent": "#477a7d",
        "sections": [
            ("What Code Does", [
                "Code is a set of instructions that a computer follows exactly.",
                "Most bugs happen because the instruction is incomplete, in the wrong order, or using unexpected data.",
                "Learning code is learning how to describe your idea clearly."
            ]),
            ("Files And Folders", [
                "HTML gives structure, CSS gives style, and JavaScript gives behavior.",
                "Keep related files named clearly so future you can find them quickly.",
                "A small project is easier to improve when each file has one main job."
            ]),
            ("Debugging Calmly", [
                "Read the error message from top to bottom.",
                "Check the file name and line number before changing many things.",
                "Make one change, test it, and keep notes when you learn something."
            ]),
            ("Mini Project", [
                "Build a page with a title, one card, and one button.",
                "Make the button change the card text.",
                "Then add a second button that resets the card."
            ])
        ]
    },
    {
        "id": "readmaster-digital-research-workbook",
        "title": "Digital Research Workbook",
        "subtitle": "Check sources and keep useful evidence organized.",
        "category": "Education",
        "color": "#236b49",
        "accent": "#d7b95a",
        "sections": [
            ("Source Quality", [
                "A useful source has an author, a date, a publisher, and a reason to trust it.",
                "Official documentation, academic institutions, public libraries, and open education projects are strong starting points.",
                "A source can be interesting without being reliable enough for your assignment."
            ]),
            ("Research Log", [
                "Save the title, link, author, date accessed, and one sentence about why the source matters.",
                "Separate facts from opinions in your notes.",
                "Mark questions that still need another source."
            ]),
            ("Compare Before Using", [
                "Check whether two independent sources agree.",
                "Look for the original report instead of only reading summaries.",
                "Be careful with copied PDFs that do not show permission or license information."
            ]),
            ("Workbook Task", [
                "Find three sources for one topic.",
                "Write one claim supported by each source.",
                "Choose the strongest source and explain why it is strongest."
            ])
        ]
    },
    {
        "id": "readmaster-accessibility-pocket-guide",
        "title": "Accessibility Pocket Guide",
        "subtitle": "Readable, reachable, and kinder interfaces.",
        "category": "Design",
        "color": "#477a7d",
        "accent": "#cfe9d2",
        "sections": [
            ("Readable Text", [
                "Use enough contrast between text and background.",
                "Avoid making important text too small.",
                "Keep line length comfortable so readers do not lose their place."
            ]),
            ("Controls", [
                "Buttons should look clickable and say what they do.",
                "Inputs need visible labels, not only placeholder text.",
                "Keyboard users should be able to reach every important action."
            ]),
            ("Layout", [
                "Group related items close together.",
                "Do not rely on color alone to explain meaning.",
                "Check small screens because cramped layouts create avoidable mistakes."
            ]),
            ("Fast Check", [
                "Zoom the page to 200 percent and see if it still works.",
                "Use Tab to move through the interface.",
                "Ask whether a new user can understand the first action in five seconds."
            ])
        ]
    },
    {
        "id": "readmaster-data-ethics-starter",
        "title": "Data Ethics Starter",
        "subtitle": "Privacy, consent, fairness, and careful choices.",
        "category": "Technology",
        "color": "#173125",
        "accent": "#4b9662",
        "sections": [
            ("Data Has People Behind It", [
                "A spreadsheet can describe real people, habits, risks, and opportunities.",
                "Treat personal data with respect even when the data looks ordinary.",
                "Ask whether collecting the data is necessary before asking how to collect it."
            ]),
            ("Consent And Purpose", [
                "People should understand what data is collected and why.",
                "Do not reuse data for a new purpose without checking permission.",
                "Keep privacy settings clear and easy to find."
            ]),
            ("Bias", [
                "Data can reflect unfair systems, missing voices, or old assumptions.",
                "Check whose data is included and whose data is missing.",
                "A fair system needs testing, feedback, and willingness to change."
            ]),
            ("Reflection", [
                "Write one benefit and one risk for a data feature.",
                "Name the person who could be harmed if the feature is wrong.",
                "Decide what data should be deleted after it is no longer needed."
            ])
        ]
    },
    {
        "id": "readmaster-personal-finance-notes",
        "title": "Personal Finance Notes",
        "subtitle": "Small money habits for calmer choices.",
        "category": "Business",
        "color": "#1b5238",
        "accent": "#d7b95a",
        "sections": [
            ("Know Your Flow", [
                "Money planning begins with knowing what comes in and what goes out.",
                "Track spending for one week without judging yourself.",
                "Patterns are more useful than guesses."
            ]),
            ("Budget Basics", [
                "Give every important expense a simple category.",
                "Set aside money for needs before wants.",
                "A budget is a plan you can adjust, not a punishment."
            ]),
            ("Saving Goals", [
                "Choose one short goal that can be reached within a month.",
                "Make the first step small enough to start today.",
                "Celebrate consistency more than amount."
            ]),
            ("Practice", [
                "List five regular expenses.",
                "Circle one expense you can reduce without hurting your wellbeing.",
                "Write where the saved money should go instead."
            ])
        ]
    },
    {
        "id": "readmaster-climate-science-reader",
        "title": "Climate Science Quick Reader",
        "subtitle": "A gentle introduction to systems and evidence.",
        "category": "Science",
        "color": "#236b49",
        "accent": "#477a7d",
        "sections": [
            ("Climate And Weather", [
                "Weather is what happens over hours or days.",
                "Climate is the pattern measured over many years.",
                "Both matter, but they answer different questions."
            ]),
            ("Evidence", [
                "Scientists use temperature records, ice cores, oceans, satellites, and ecosystems.",
                "One measurement can be noisy, but many measurements can show a pattern.",
                "Good science keeps checking the pattern with new data."
            ]),
            ("Systems", [
                "Air, oceans, land, ice, plants, and people all interact.",
                "A change in one part of the system can affect another part later.",
                "This is why climate learning needs patience and careful comparison."
            ]),
            ("Question Set", [
                "What is one difference between weather and climate?",
                "Why do scientists use many kinds of evidence?",
                "What local example helps you think about climate impacts?"
            ])
        ]
    },
    {
        "id": "readmaster-creative-writing-prompts",
        "title": "Creative Writing Prompts",
        "subtitle": "Short exercises for story practice.",
        "category": "Literature",
        "color": "#173125",
        "accent": "#c46f55",
        "sections": [
            ("Character", [
                "Write about someone who keeps a secret for a kind reason.",
                "Give the character one habit, one fear, and one object they always carry.",
                "Let the object become important before the end of the scene."
            ]),
            ("Setting", [
                "Describe a library after closing time.",
                "Use three sounds, two textures, and one smell.",
                "Avoid naming the emotion directly. Let the room create it."
            ]),
            ("Conflict", [
                "Two friends want the same opportunity for different reasons.",
                "Neither person is completely wrong.",
                "Write the conversation where they finally say what they mean."
            ]),
            ("Reflection", [
                "After writing, underline the sentence with the most energy.",
                "Cut one sentence that explains too much.",
                "Write a new final line that leaves a question open."
            ])
        ]
    }
]


def draw_wrapped(pdf, text, x, y, max_chars, font="Helvetica", size=10.5, leading=15, fill=colors.black):
    pdf.setFillColor(fill)
    pdf.setFont(font, size)
    for line in textwrap.wrap(text, width=max_chars):
        pdf.drawString(x, y, line)
        y -= leading
    return y


def draw_header(pdf, book, page_number):
    width, height = letter
    pdf.setFillColor(HexColor(book["color"]))
    pdf.rect(0, height - 0.42 * inch, width, 0.42 * inch, fill=True, stroke=False)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(0.72 * inch, height - 0.27 * inch, "Read_Master Original Demo PDF")
    pdf.drawRightString(width - 0.72 * inch, height - 0.27 * inch, f"Page {page_number}")


def draw_cover(pdf, book):
    width, height = letter
    pdf.setFillColor(HexColor(book["color"]))
    pdf.rect(0, 0, width, height, fill=True, stroke=False)

    pdf.setFillColor(HexColor(book["accent"]))
    pdf.rect(0.7 * inch, 0.7 * inch, 0.34 * inch, height - 1.4 * inch, fill=True, stroke=False)
    pdf.setFillColor(colors.white)
    pdf.rect(1.08 * inch, 0.7 * inch, width - 1.78 * inch, height - 1.4 * inch, fill=False, stroke=True)

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(1.35 * inch, height - 1.45 * inch, book["category"].upper())
    pdf.setFont("Helvetica-Bold", 34)
    y = height - 2.2 * inch
    for line in textwrap.wrap(book["title"], width=18):
        pdf.drawString(1.35 * inch, y, line)
        y -= 0.5 * inch

    y -= 0.15 * inch
    y = draw_wrapped(pdf, book["subtitle"], 1.35 * inch, y, 42, "Helvetica-Bold", 13, 20, HexColor("#e8f3e7"))

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(1.35 * inch, 1.35 * inch, "Read_Master Studio")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(1.35 * inch, 1.08 * inch, "Original sample content for app testing.")


def draw_content_page(pdf, book, page_number, sections):
    width, height = letter
    margin_x = 0.78 * inch
    y = height - 0.9 * inch

    draw_header(pdf, book, page_number)
    pdf.setFillColor(HexColor("#123d2a"))
    pdf.setFont("Helvetica-Bold", 19)
    pdf.drawString(margin_x, y, book["title"])
    y -= 0.42 * inch

    for heading, points in sections:
        pdf.setFillColor(HexColor(book["color"]))
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(margin_x, y, heading)
        y -= 0.25 * inch

        for point in points:
            y = draw_wrapped(
                pdf,
                f"- {point}",
                margin_x + 0.12 * inch,
                y,
                88,
                "Helvetica",
                10.5,
                15,
                HexColor("#244235")
            )
            y -= 0.08 * inch

        y -= 0.1 * inch

    pdf.setFillColor(HexColor("#eaf4e6"))
    pdf.rect(margin_x, 0.65 * inch, width - (margin_x * 2), 0.48 * inch, fill=True, stroke=False)
    pdf.setFillColor(HexColor("#123d2a"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(width / 2, 0.84 * inch, "Free original demo material for Read_Master testing.")


def create_pdf(book):
    BOOK_DIR.mkdir(parents=True, exist_ok=True)
    output = BOOK_DIR / f"{book['id']}.pdf"
    pdf = canvas.Canvas(str(output), pagesize=letter)
    pdf.setTitle(book["title"])
    pdf.setAuthor("Read_Master Studio")
    pdf.setSubject("Original demo e-book content")

    draw_cover(pdf, book)
    pdf.showPage()

    section_pairs = [book["sections"][0:2], book["sections"][2:4]]
    for index, sections in enumerate(section_pairs, start=2):
        draw_content_page(pdf, book, index, sections)
        pdf.showPage()

    pdf.save()
    return output


def main():
    outputs = [create_pdf(book) for book in BOOKS]
    for output in outputs:
        print(output.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()

from pypdf import PdfReader


def extract_pdf_text(path: str) -> str:
    reader = PdfReader(path)

    all_pages = []

    for page in reader.pages:
        # Extract normal visible text
        text = page.extract_text() or ""

        # Extract clickable links
        links = []

        annotations = page.get("/Annots")

        if annotations:
            for annotation in annotations:
                obj = annotation.get_object()

                if obj.get("/Subtype") != "/Link":
                    continue

                action = obj.get("/A")

                if not action:
                    continue

                uri = action.get("/URI")

                if uri:
                    uri = str(uri)

                    if uri not in links:
                        links.append(uri)

        # Replace common link labels with their actual URLs
        if links:
            for url in links:
                lower_url = url.lower()

                if "linkedin.com" in lower_url:
                    text = text.replace(
                        "LinkedIn",
                        f"LinkedIn: {url}",
                        1
                    )

                elif "github.com" in lower_url:
                    text = text.replace(
                        "GitHub",
                        f"GitHub: {url}",
                        1
                    )

                elif "portfolio" in lower_url or "vercel.app" in lower_url:
                    text = text.replace(
                        "Portfolio",
                        f"Portfolio: {url}",
                        1
                    )

                elif "x.com" in lower_url or "twitter.com" in lower_url:
                    text = text.replace(
                        "Twitter / X",
                        f"Twitter / X: {url}",
                        1
                    )

                elif "mailto:" in lower_url:
                    # Email is already visible in most resumes,
                    # so don't add mailto URL separately.
                    continue

        all_pages.append(text)

    return "\n".join(all_pages).strip()
"""Live Google Vision Web Detection; page candidates only, never invented URLs."""
from dataclasses import asdict, dataclass
import ipaddress
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

SOCIAL_DOMAINS = {"instagram.com", "facebook.com", "x.com", "twitter.com",
                  "linkedin.com", "tiktok.com", "reddit.com"}
PROVIDER = "google_cloud_vision_web_detection"


def public_web_url(url: str) -> bool:
    try:
        parsed = urlsplit(url)
        hostname = parsed.hostname or ""
        if (parsed.scheme not in {"http", "https"} or not hostname or parsed.username
                or parsed.password or parsed.port not in {None, 80, 443}
                or any(ord(c) <= 32 or ord(c) == 127 for c in url) or "\\" in url):
            return False
        try:
            return ipaddress.ip_address(hostname).is_global
        except ValueError:
            return "." in hostname and not hostname.lower().endswith((".local", ".localhost", ".internal", ".test", ".invalid"))
    except ValueError:
        return False


def is_social_url(url: str) -> bool:
    if not public_web_url(url):
        return False
    hostname = (urlsplit(url).hostname or "").lower().rstrip(".")
    return any(hostname == d or hostname.endswith("." + d) for d in SOCIAL_DOMAINS)


def normalized_key(url: str | None) -> str | None:
    if not url:
        return None
    parsed = urlsplit(url)
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if ":" in hostname:
        hostname = f"[{hostname}]"
    port = parsed.port
    netloc = hostname if port is None or (parsed.scheme, port) in {("http", 80), ("https", 443)} else f"{hostname}:{port}"
    return urlunsplit((parsed.scheme.lower(), netloc, parsed.path or "/", parsed.query, ""))


@dataclass(frozen=True)
class Candidate:
    page_url: str
    page_title: str | None
    image_url: str | None
    reverse_match_type: str
    reverse_provider: str = PROVIDER
    is_social: bool = False


def candidate_to_dict(candidate: Candidate) -> dict:
    return asdict(candidate)


def candidates_from_web(web) -> list[Candidate]:
    candidates = []
    for page in web.pages_with_matching_images:
        if not public_web_url(page.url):
            continue
        matched = []
        for kind, images in (("FULL", page.full_matching_images), ("PARTIAL", page.partial_matching_images)):
            matched.extend((kind, image.url) for image in images if public_web_url(image.url))
        for kind, image_url in matched or [("PAGE_MATCH", None)]:
            candidates.append(Candidate(page.url, getattr(page, "page_title", None) or None,
                                        image_url, kind, is_social=is_social_url(page.url)))
    priority = {"FULL": 0, "PARTIAL": 1, "PAGE_MATCH": 2}
    candidates.sort(key=lambda c: (not c.is_social, priority[c.reverse_match_type]))
    seen, result = set(), []
    for candidate in candidates:
        key = (normalized_key(candidate.page_url), normalized_key(candidate.image_url))
        if key not in seen:
            seen.add(key)
            result.append(candidate)
    # Preserve exact returned URLs in records; normalization is only for deduplication.
    return result


def search_web(image_path: str, evidence_path: str | Path | None = None) -> list[Candidate]:
    from google.cloud import vision
    from record import utc_now, write_canonical_record
    from common import load_environment
    load_environment()
    client = vision.ImageAnnotatorClient()
    try:
        response = client.web_detection(image=vision.Image(content=Path(image_path).read_bytes()), timeout=60)
    finally:
        client.transport.close()
    if response.error.message:
        raise RuntimeError(f"Google Cloud Vision: {response.error.message}")
    if evidence_path:
        write_canonical_record({"provider": PROVIDER, "queried_at_utc": utc_now(),
                                "response": type(response).to_dict(response)}, evidence_path)
    return candidates_from_web(response.web_detection)

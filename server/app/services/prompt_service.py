"""
Versioned prompt service.

Loads system prompts from:
    app/prompts/{prompt_key}/v001.txt, v002.txt, ...

- get_prompt(key)         → latest prompt text
- get_prompt_version(key) → version string, e.g. "v002"
"""

import re
from pathlib import Path
from typing import Dict, Optional, Tuple

_VERSION_RE = re.compile(r"^(v\d+)\.txt$")

# app/prompts/ — lives inside the package, shipped via COPY . . in Docker
_APP_DIR = Path(__file__).resolve().parent.parent  # → server/app/
_DEFAULT_PROMPTS_DIR = _APP_DIR / "prompts"


class PromptService:
    def __init__(self, prompts_dir: Optional[Path] = None):
        self.prompts_dir = prompts_dir or _DEFAULT_PROMPTS_DIR
        self._cache: Dict[str, Tuple[str, str]] = {}  # key → (version, text)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def get_prompt(self, prompt_key: str) -> str:
        """Return the latest prompt text for *prompt_key*."""
        ver, text = self._load_latest(prompt_key)
        return text

    def get_prompt_version(self, prompt_key: str) -> str:
        """Return the version string (e.g. 'v002') for *prompt_key*."""
        ver, _text = self._load_latest(prompt_key)
        return ver

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _load_latest(self, prompt_key: str) -> Tuple[str, str]:
        if prompt_key in self._cache:
            return self._cache[prompt_key]

        key_dir = self.prompts_dir / prompt_key
        versions = self._list_versions(key_dir)
        if not versions:
            raise FileNotFoundError(
                f"No prompt versions found for '{prompt_key}' in {key_dir}"
            )

        latest_ver, latest_file = versions[-1]
        text = latest_file.read_text(encoding="utf-8").strip()
        self._cache[prompt_key] = (latest_ver, text)
        return latest_ver, text

    @staticmethod
    def _list_versions(key_dir: Path) -> list[Tuple[str, Path]]:
        """Return sorted list of (version_str, path) for all version files."""
        if not key_dir.is_dir():
            return []
        results = []
        for f in key_dir.iterdir():
            m = _VERSION_RE.match(f.name)
            if m:
                results.append((m.group(1), f))
        results.sort(key=lambda x: x[0])
        return results


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
_prompt_service: Optional[PromptService] = None


def get_prompt_service() -> PromptService:
    """Get the singleton prompt service instance."""
    global _prompt_service
    if _prompt_service is None:
        _prompt_service = PromptService()
    return _prompt_service

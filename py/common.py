"""Repository paths, environment loading, and the Python/Node JSON boundary."""
import json
import os
import signal
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_environment() -> None:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")
    os.environ.setdefault("DEEPFACE_HOME", str(ROOT / ".cache"))


def safe_error(error: Exception) -> str:
    message = str(error)
    for name in ("PRIVATE_KEY", "GOOGLE_APPLICATION_CREDENTIALS"):
        secret = os.environ.get(name)
        if secret:
            message = message.replace(secret, "[redacted]")
    return message[:1500]


def run_node_json(script: str, *args: str, timeout: int = 600) -> dict:
    executable = ROOT / "node_modules" / ".bin" / "tsx"
    if not executable.is_file():
        raise RuntimeError("Node dependencies missing; run npm ci at the repository root")
    # stderr is inherited: progress and broadcast tx hashes remain visible during a wait.
    # tsx spawns Node: stop the entire process group on timeout/interrupt, not only its launcher.
    proc = subprocess.Popen([str(executable), str(ROOT / script), *map(str, args)],
                            cwd=ROOT, stdout=subprocess.PIPE, text=True, start_new_session=True)
    try:
        stdout, _ = proc.communicate(timeout=timeout)
    except (subprocess.TimeoutExpired, KeyboardInterrupt) as exc:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.communicate()
        if isinstance(exc, KeyboardInterrupt):
            raise
        raise RuntimeError("Node command timed out. Inspect saved transaction evidence before retrying any write.") from exc
    if proc.returncode:
        raise RuntimeError(f"{script} failed (exit {proc.returncode}); see the provider error above")
    try:
        result = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{script} did not return a single JSON object") from exc
    if not isinstance(result, dict):
        raise RuntimeError(f"{script} returned an invalid result")
    return result

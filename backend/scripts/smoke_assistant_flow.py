"""Smoke de flujo asistente (como usuario API, sin LLM).

Uso (API en :5000, mismo host que los JSON locales):
  uv run python scripts/smoke_assistant_flow.py

Sale distinto de 0 si algo falla. No llama a Gemini: threads + memoria.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services import finance_store  # noqa: E402


def _req(base: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw) if raw else {}
            return resp.status, payload if isinstance(payload, dict) else {"data": payload}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": raw}
        return exc.code, payload if isinstance(payload, dict) else {"error": raw}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:5000")
    args = parser.parse_args()
    base = args.base
    steps: list[str] = []
    smoke_prefix = "Smoke UX:"

    def check(ok: bool, label: str, detail: str = "") -> None:
        mark = "OK" if ok else "FAIL"
        steps.append(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
        if not ok:
            raise AssertionError(label)

    try:
        code, listed = _req(base, "GET", "/api/assistant/threads")
        check(code == 200 and "threads" in listed, "list threads", f"status={code}")

        code, created = _req(
            base, "POST", "/api/assistant/threads", {"new": True, "title": "Smoke UX"}
        )
        check(
            code in (200, 201) and bool(created.get("thread", {}).get("id")),
            "create thread",
            f"status={code}",
        )
        tid = created["thread"]["id"]

        code, hist = _req(base, "GET", f"/api/assistant/threads/{tid}/messages")
        check(
            code == 200 and isinstance(hist.get("messages"), list),
            "thread history",
            f"status={code}",
        )

        finance_store.upsert_memory_facts(
            [{"fact": f"{smoke_prefix} revisar metas el viernes", "category": "habit"}]
        )
        code, mem = _req(base, "GET", "/api/assistant/memory")
        check(code == 200 and len(mem.get("facts") or []) >= 1, "memory lists facts")
        fact = next(f for f in mem["facts"] if str(f.get("fact", "")).startswith(smoke_prefix))
        fact_id = fact["id"]

        code, patched = _req(base, "PATCH", f"/api/assistant/memory/{fact_id}", {"active": False})
        check(code == 200, "deactivate fact", f"status={code}")
        check(
            fact_id not in {f["id"] for f in patched.get("facts") or []},
            "deactivated fact hidden from active list",
        )

        finance_store.upsert_memory_facts(
            [{"fact": f"{smoke_prefix} borrar este fact", "category": "general"}]
        )
        code, mem2 = _req(base, "GET", "/api/assistant/memory")
        kill = next(f for f in mem2["facts"] if "borrar este fact" in str(f.get("fact", "")))
        code, deleted = _req(base, "DELETE", f"/api/assistant/memory/{kill['id']}")
        check(code == 200, "delete fact", f"status={code}")
        check(
            kill["id"] not in {f["id"] for f in deleted.get("facts") or []},
            "deleted fact gone",
        )

        code, listed2 = _req(base, "GET", "/api/assistant/threads")
        ids = {t["id"] for t in listed2.get("threads") or []}
        check(tid in ids, "created thread still listed")

    except AssertionError:
        print("\n".join(steps))
        return 1
    except Exception as exc:
        print("\n".join(steps))
        print(f"[FAIL] unexpected: {exc}")
        return 1

    print("\n".join(steps))
    print("[OK] smoke_assistant_flow")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

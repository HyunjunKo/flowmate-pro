"""워크플로우 실행 엔진"""
from __future__ import annotations
import asyncio
import httpx
import os
from datetime import datetime, timezone
from typing import Any
from app.db.supabase import get_supabase_admin


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_workflow(execution_id: str) -> None:
    sb = get_supabase_admin()

    exec_row = sb.table("executions").select(
        "*, workflow_versions(nodes, edges)"
    ).eq("id", execution_id).single().execute().data

    if not exec_row:
        return

    sb.table("executions").update({"status": "running", "started_at": now()}).eq("id", execution_id).execute()

    nodes: list[dict] = exec_row["workflow_versions"]["nodes"]
    edges: list[dict] = exec_row["workflow_versions"]["edges"]
    ordered = _topological_sort(nodes, edges)

    context: dict[str, Any] = {
        "trigger_data": exec_row.get("trigger_data", {}),
        "user_id": exec_row.get("triggered_by", ""),
    }
    nodes_success = 0
    nodes_failed = 0
    error_node_id = None

    for node in ordered:
        node_id = node["id"]
        node_key = node["data"].get("nodeKey", "")
        config = node["data"].get("config", {}) or {}

        log = sb.table("execution_node_logs").insert({
            "execution_id": execution_id,
            "node_id": node_id,
            "node_key": node_key,
            "status": "running",
            "input_data": config,
            "started_at": now(),
        }).execute().data[0]

        try:
            output = await _execute_node(node_key, config, context)
            context[node_id] = output

            sb.table("execution_node_logs").update({
                "status": "success",
                "output_data": output,
                "finished_at": now(),
            }).eq("id", log["id"]).execute()
            nodes_success += 1

        except Exception as e:
            sb.table("execution_node_logs").update({
                "status": "failed",
                "error_message": str(e),
                "finished_at": now(),
            }).eq("id", log["id"]).execute()
            nodes_failed += 1
            error_node_id = node_id
            break

    final_status = "success" if nodes_failed == 0 else "failed"
    sb.table("executions").update({
        "status": final_status,
        "finished_at": now(),
        "nodes_total": len(ordered),
        "nodes_success": nodes_success,
        "nodes_failed": nodes_failed,
        "error_node_id": error_node_id,
        "output_data": context,
    }).eq("id", execution_id).execute()

    wf_id = exec_row["workflow_id"]
    sb.rpc("increment_workflow_stats", {
        "p_workflow_id": wf_id,
        "p_success": 1 if final_status == "success" else 0,
        "p_fail": 1 if final_status == "failed" else 0,
    }).execute()


# ── 노드 실행 라우터 ────────────────────────────────────────────────────────────

async def _execute_node(node_key: str, config: dict, context: dict) -> dict:
    from app.services.integrations import (
        kakao, gmail, slack, google_sheets, google_calendar, notion, naver
    )

    resolved = _resolve_variables(config, context)
    user_id = context.get("user_id", "")

    # ── 트리거 ──────────────────────────────────────────────────────────────────
    if node_key.startswith("trigger."):
        return {"triggered_at": now(), **context.get("trigger_data", {})}

    # ── 흐름 제어 ────────────────────────────────────────────────────────────────
    if node_key == "flow.delay":
        unit = resolved.get("unit", "분")
        amount = int(resolved.get("amount", 1))
        seconds = amount * {"초": 1, "분": 60, "시간": 3600, "일": 86400}.get(unit, 60)
        await asyncio.sleep(min(seconds, 30))
        return {"waited_seconds": min(seconds, 30), "waited_until": now()}

    if node_key == "flow.condition":
        matched = _evaluate_conditions(resolved.get("conditions", []), context)
        return {"matched": matched, "branch": "true" if matched else "false"}

    if node_key == "flow.loop":
        list_ref = resolved.get("list", "")
        items = _get_nested(context, list_ref) if list_ref else []
        if not isinstance(items, list):
            items = [items] if items else []
        if items:
            return {"items": items, "item": items[0], "index": 0, "total": len(items)}
        return {"items": [], "item": None, "index": 0, "total": 0}

    # ── 카카오 ───────────────────────────────────────────────────────────────────
    if node_key == "kakao.send_message":
        return await kakao.send_message(user_id, resolved)

    if node_key == "kakao.alimtalk":
        return await kakao.send_alimtalk(resolved)

    # ── 네이버 ───────────────────────────────────────────────────────────────────
    if node_key == "naver.send_email":
        return await naver.send_email(user_id, resolved)

    if node_key == "naver.cafe_post":
        return await naver.cafe_post(user_id, resolved)

    # ── Gmail ─────────────────────────────────────────────────────────────────
    if node_key == "gmail.send_email":
        return await gmail.send_email(user_id, resolved)

    if node_key == "gmail.watch_inbox":
        return {"triggered_at": now(), "note": "Gmail 트리거는 웹훅 설정 후 자동 실행됩니다"}

    # ── Slack ─────────────────────────────────────────────────────────────────
    if node_key == "slack.send_message":
        return await slack.send_message(user_id, resolved)

    # ── Google Sheets ─────────────────────────────────────────────────────────
    if node_key == "google_sheets.append_row":
        return await google_sheets.append_row(user_id, resolved)

    if node_key == "google_sheets.get_rows":
        return await google_sheets.get_rows(user_id, resolved)

    # ── Google Calendar ───────────────────────────────────────────────────────
    if node_key == "google_calendar.create_event":
        return await google_calendar.create_event(user_id, resolved)

    # ── Notion ────────────────────────────────────────────────────────────────
    if node_key == "notion.create_page":
        return await notion.create_page(user_id, resolved)

    # ── AI ────────────────────────────────────────────────────────────────────
    if node_key == "ai.generate_text":
        return await _ai_generate(resolved)

    if node_key == "ai.summarize":
        return await _ai_summarize(resolved)

    if node_key == "ai.translate":
        return await _ai_translate(resolved)

    if node_key == "ai.sentiment":
        return await _ai_sentiment(resolved)

    # ── 변환 ─────────────────────────────────────────────────────────────────
    if node_key == "transform.text":
        return _transform_text(resolved)

    if node_key == "transform.format_date":
        return _format_date(resolved)

    raise ValueError(f"지원하지 않는 노드입니다: '{node_key}'")


# ── AI 핸들러 ─────────────────────────────────────────────────────────────────

def _anthropic_headers() -> dict:
    return {
        "x-api-key": _get_anthropic_key(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }


async def _ai_generate(config: dict) -> dict:
    prompt = config.get("prompt", "")
    tone = config.get("tone", "친근하게")
    max_length = int(config.get("max_length", 500))
    tone_map = {
        "친근하게": "friendly and warm",
        "공식적으로": "formal and professional",
        "간결하게": "concise and brief",
        "상세하게": "detailed and comprehensive",
    }
    system = (
        f"You are a helpful assistant. Write in Korean. "
        f"Tone: {tone_map.get(tone, 'friendly')}. Max {max_length} characters."
    )
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=_anthropic_headers(),
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": min(max_length * 2, 2048),
                "system": system,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        res.raise_for_status()
        data = res.json()
        return {"text": data["content"][0]["text"][:max_length], "tokens_used": data["usage"]["output_tokens"]}


async def _ai_summarize(config: dict) -> dict:
    text = config.get("text", "")
    if not text.strip():
        raise ValueError("요약할 텍스트를 입력해주세요")
    length_map = {"한 문장": "one sentence", "세 줄": "three bullet points", "다섯 줄": "five bullet points"}
    length = length_map.get(config.get("length", "세 줄"), "three bullet points")
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=_anthropic_headers(),
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "messages": [{"role": "user", "content": f"Summarize in Korean in {length}:\n\n{text}"}],
            },
            timeout=30,
        )
        res.raise_for_status()
        return {"summary": res.json()["content"][0]["text"]}


async def _ai_translate(config: dict) -> dict:
    text = config.get("text", "")
    if not text.strip():
        raise ValueError("번역할 텍스트를 입력해주세요")
    target = config.get("target_language", "영어")
    lang_map = {
        "영어": "English", "일본어": "Japanese", "중국어": "Chinese (Simplified)",
        "스페인어": "Spanish", "프랑스어": "French", "독일어": "German",
        "한국어": "Korean", "포르투갈어": "Portuguese", "러시아어": "Russian",
    }
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=_anthropic_headers(),
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": f"Translate to {lang_map.get(target, target)}. Reply with translation only:\n\n{text}"}],
            },
            timeout=30,
        )
        res.raise_for_status()
        return {"translated": res.json()["content"][0]["text"], "source_language": "자동감지", "target_language": target}


async def _ai_sentiment(config: dict) -> dict:
    text = config.get("text", "")
    if not text.strip():
        raise ValueError("분석할 텍스트를 입력해주세요")
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=_anthropic_headers(),
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 128,
                "messages": [{"role": "user", "content": 'Analyze sentiment. Reply JSON only: {"sentiment":"긍정|부정|중립","score":0.0-1.0,"reason":"한 문장"}\n\n' + text}],
            },
            timeout=30,
        )
        res.raise_for_status()
        import json as _json
        raw = res.json()["content"][0]["text"]
        try:
            return _json.loads(raw)
        except Exception:
            s = "긍정" if "긍정" in raw else "부정" if "부정" in raw else "중립"
            return {"sentiment": s, "score": 0.75, "reason": raw}


# ── 변환 핸들러 ────────────────────────────────────────────────────────────────

def _transform_text(config: dict) -> dict:
    text = str(config.get("input", ""))
    operations = config.get("operations", [])
    if isinstance(operations, str):
        operations = [operations]
    for op in operations:
        if op == "대문자로":          text = text.upper()
        elif op == "소문자로":        text = text.lower()
        elif op == "앞뒤 공백 제거":  text = text.strip()
        elif op == "줄바꿈 제거":     text = text.replace("\n", " ").replace("\r", "")
        elif op == "특수문자 제거":
            import re; text = re.sub(r"[^\w\s가-힣]", "", text)
        elif op == "HTML 태그 제거":
            import re; text = re.sub(r"<[^>]+>", "", text)
    return {"result": text, "length": len(text)}


def _format_date(config: dict) -> dict:
    import pendulum
    try:
        raw = config.get("input", "")
        dt = pendulum.parse(raw, strict=False) if raw else pendulum.now("Asia/Seoul")
        if dt is None:
            dt = pendulum.now("Asia/Seoul")
    except Exception:
        dt = pendulum.now("Asia/Seoul")
    kst = dt.in_timezone("Asia/Seoul")
    fmt = config.get("format", "YYYY-MM-DD")
    fmt_map = {
        "YYYY년 MM월 DD일":  kst.format("YYYY년 MM월 DD일"),
        "YYYY-MM-DD":        kst.format("YYYY-MM-DD"),
        "MM/DD/YYYY":        kst.format("MM/DD/YYYY"),
        "HH:mm":             kst.format("HH:mm"),
        "YYYY-MM-DD HH:mm":  kst.format("YYYY-MM-DD HH:mm"),
        "오늘":               pendulum.now("Asia/Seoul").format("YYYY-MM-DD"),
        "어제":               pendulum.now("Asia/Seoul").subtract(days=1).format("YYYY-MM-DD"),
        "이번 주 월요일":     pendulum.now("Asia/Seoul").start_of("week").format("YYYY-MM-DD"),
        "이번 달 1일":        pendulum.now("Asia/Seoul").start_of("month").format("YYYY-MM-DD"),
    }
    return {"result": fmt_map.get(fmt, kst.format("YYYY-MM-DD")), "iso": kst.isoformat()}


# ── 조건 평가 ──────────────────────────────────────────────────────────────────

def _evaluate_conditions(conditions: list, context: dict) -> bool:
    if not conditions:
        return True
    for cond in conditions:
        field = cond.get("field", "")
        op = cond.get("operator", "같다")
        value = str(cond.get("value", ""))
        actual = str(_get_nested(context, field) or "")
        if op == "같다"           and actual != value:     return False
        if op == "같지 않다"       and actual == value:     return False
        if op == "포함한다"        and value not in actual: return False
        if op == "포함하지 않는다"  and value in actual:     return False
        if op == "보다 크다":
            try:
                if float(actual) <= float(value): return False
            except ValueError: return False
        if op == "보다 작다":
            try:
                if float(actual) >= float(value): return False
            except ValueError: return False
        if op == "비어있다"        and actual.strip():      return False
        if op == "비어있지 않다"    and not actual.strip():  return False
    return True


# ── 변수 치환 ──────────────────────────────────────────────────────────────────

def _resolve_variables(config: dict, context: dict) -> dict:
    import re

    def _resolve(v: Any) -> Any:
        if isinstance(v, str):
            def rep(m: re.Match) -> str:
                r = _get_nested(context, m.group(1))
                return str(r) if r is not None else m.group(0)
            return re.sub(r"\{\{(.+?)\}\}", rep, v)
        if isinstance(v, dict):
            return {k: _resolve(val) for k, val in v.items()}
        if isinstance(v, list):
            return [_resolve(i) for i in v]
        return v

    return {k: _resolve(v) for k, v in config.items()}


def _get_nested(data: Any, path: str) -> Any:
    if not path or not isinstance(data, dict):
        return None
    cur = data
    for k in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return None
    return cur


# ── 위상 정렬 ──────────────────────────────────────────────────────────────────

def _topological_sort(nodes: list, edges: list) -> list:
    node_map = {n["id"]: n for n in nodes}
    in_degree = {n["id"]: 0 for n in nodes}
    adj: dict[str, list] = {n["id"]: [] for n in nodes}

    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src and tgt and src in adj and tgt in in_degree:
            adj[src].append(tgt)
            in_degree[tgt] += 1

    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    ordered: list = []
    while queue:
        nid = queue.pop(0)
        if nid in node_map:
            ordered.append(node_map[nid])
        for neighbor in adj.get(nid, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    return ordered


def _get_anthropic_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY가 설정되지 않았습니다")
    return key

"""워크플로우 실행 엔진"""
from __future__ import annotations
import httpx
from datetime import datetime, timezone
from typing import Any
from app.db.supabase import get_supabase_admin


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_workflow(execution_id: str) -> None:
    sb = get_supabase_admin()

    # 실행 정보 조회
    exec_row = sb.table("executions").select(
        "*, workflow_versions(nodes, edges)"
    ).eq("id", execution_id).single().execute().data

    if not exec_row:
        return

    sb.table("executions").update({"status": "running", "started_at": now()}).eq("id", execution_id).execute()

    nodes: list[dict] = exec_row["workflow_versions"]["nodes"]
    edges: list[dict] = exec_row["workflow_versions"]["edges"]

    # 노드 실행 순서 결정 (위상 정렬)
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
        config = node["data"].get("config", {})

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

    # 워크플로우 통계 업데이트
    wf_id = exec_row["workflow_id"]
    sb.rpc("increment_workflow_stats", {
        "p_workflow_id": wf_id,
        "p_success": 1 if final_status == "success" else 0,
        "p_fail": 1 if final_status == "failed" else 0,
    }).execute()


async def _execute_node(node_key: str, config: dict, context: dict) -> dict:
    """노드 타입별 실행"""
    from app.services.integrations import kakao, gmail, slack, google_sheets

    # 변수 치환: {{node_id.field}} 형태
    resolved = _resolve_variables(config, context)
    user_id = context.get("user_id", "")

    if node_key.startswith("trigger."):
        return {"triggered_at": now()}

    # ── 흐름 제어 ──────────────────────────────
    if node_key == "flow.delay":
        import asyncio
        unit = resolved.get("unit", "분")
        amount = int(resolved.get("amount", 1))
        seconds = amount * {"분": 60, "시간": 3600, "일": 86400}.get(unit, 60)
        await asyncio.sleep(min(seconds, 5))
        return {"waited_until": now()}

    if node_key == "flow.condition":
        matched = _evaluate_conditions(resolved.get("conditions", []), context)
        return {"matched": matched, "branch": "true" if matched else "false"}

    # ── 카카오 ─────────────────────────────────
    if node_key == "kakao.send_message":
        return await kakao.send_message(user_id, resolved)

    if node_key == "kakao.alimtalk":
        return await kakao.send_alimtalk(resolved)

    # ── Gmail ──────────────────────────────────
    if node_key == "gmail.send_email":
        return await gmail.send_email(user_id, resolved)

    # ── Slack ──────────────────────────────────
    if node_key == "slack.send_message":
        return await slack.send_message(user_id, resolved)

    # ── Google Sheets ──────────────────────────
    if node_key == "google_sheets.append_row":
        return await google_sheets.append_row(user_id, resolved)

    if node_key == "google_sheets.get_rows":
        return await google_sheets.get_rows(user_id, resolved)

    # ── AI ─────────────────────────────────────
    if node_key == "ai.generate_text":
        return await _ai_generate(resolved)

    if node_key == "ai.summarize":
        return await _ai_summarize(resolved)

    if node_key == "ai.translate":
        return await _ai_translate(resolved)

    if node_key == "ai.sentiment":
        return await _ai_sentiment(resolved)

    # ── 변환 ───────────────────────────────────
    if node_key == "transform.text":
        return _transform_text(resolved)

    if node_key == "transform.format_date":
        return _format_date(resolved)

    # 미구현
    return {"status": "ok", "node_key": node_key, "note": "연동 준비 중"}


async def _ai_generate(config: dict) -> dict:
    prompt = config.get("prompt", "")
    tone = config.get("tone", "친근하게")
    max_length = config.get("max_length", 500)

    tone_map = {
        "친근하게": "friendly and warm",
        "공식적으로": "formal and professional",
        "간결하게": "concise and brief",
        "상세하게": "detailed and comprehensive",
    }

    system = f"You are a helpful assistant. Write in Korean. Tone: {tone_map.get(tone, 'friendly')}. Max {max_length} characters."

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": _get_anthropic_key(),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "system": system,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        res.raise_for_status()
        text = res.json()["content"][0]["text"]
        return {"text": text[:max_length], "tokens_used": res.json()["usage"]["output_tokens"]}


async def _ai_summarize(config: dict) -> dict:
    text = config.get("text", "")
    length_map = {"한 문장": "one sentence", "세 줄": "three bullet points", "다섯 줄": "five bullet points"}
    length = length_map.get(config.get("length", "세 줄"), "three bullet points")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": _get_anthropic_key(),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "messages": [{"role": "user", "content": f"Summarize the following text in Korean in {length}:\n\n{text}"}],
            },
            timeout=30,
        )
        res.raise_for_status()
        return {"summary": res.json()["content"][0]["text"]}


async def _ai_translate(config: dict) -> dict:
    text = config.get("text", "")
    target = config.get("target_language", "영어")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": _get_anthropic_key(),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": f"Translate to {target}. Reply with translation only:\n\n{text}"}],
            },
            timeout=30,
        )
        res.raise_for_status()
        return {"translated": res.json()["content"][0]["text"], "source_language": "자동감지"}


async def _ai_sentiment(config: dict) -> dict:
    text = config.get("text", "")
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": _get_anthropic_key(),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 64,
                "messages": [{"role": "user", "content": f"Analyze sentiment of this text. Reply with JSON only: {{\"sentiment\": \"긍정|부정|중립\", \"score\": 0.0-1.0}}\n\n{text}"}],
            },
            timeout=30,
        )
        res.raise_for_status()
        import json as _json
        raw = res.json()["content"][0]["text"]
        try:
            return _json.loads(raw)
        except Exception:
            return {"sentiment": "중립", "score": 0.5}


def _transform_text(config: dict) -> dict:
    text = str(config.get("input", ""))
    for op in config.get("operations", []):
        if op == "대문자로": text = text.upper()
        elif op == "소문자로": text = text.lower()
        elif op == "앞뒤 공백 제거": text = text.strip()
        elif op == "줄바꿈 제거": text = text.replace("\n", " ")
        elif op == "특수문자 제거":
            import re
            text = re.sub(r"[^\w\s가-힣]", "", text)
    return {"result": text}


def _format_date(config: dict) -> dict:
    from datetime import datetime
    import pendulum
    try:
        dt = pendulum.parse(config.get("input", ""), strict=False) or pendulum.now("Asia/Seoul")
    except Exception:
        dt = pendulum.now("Asia/Seoul")

    fmt = config.get("format", "YYYY-MM-DD")
    fmt_map = {
        "YYYY년 MM월 DD일": dt.format("YYYY년 MM월 DD일"),
        "YYYY-MM-DD": dt.format("YYYY-MM-DD"),
        "MM/DD/YYYY": dt.format("MM/DD/YYYY"),
        "오늘": pendulum.now("Asia/Seoul").format("YYYY-MM-DD"),
        "어제": pendulum.now("Asia/Seoul").subtract(days=1).format("YYYY-MM-DD"),
        "이번 주 월요일": pendulum.now("Asia/Seoul").start_of("week").format("YYYY-MM-DD"),
    }
    return {"result": fmt_map.get(fmt, dt.format("YYYY-MM-DD"))}


def _evaluate_conditions(conditions: list, context: dict) -> bool:
    for cond in conditions:
        field = cond.get("field", "")
        op = cond.get("operator", "같다")
        value = cond.get("value", "")
        actual = str(_get_nested(context, field))
        if op == "같다" and actual != value: return False
        if op == "같지 않다" and actual == value: return False
        if op == "포함한다" and value not in actual: return False
        if op == "포함하지 않는다" and value in actual: return False
    return True


def _resolve_variables(config: dict, context: dict) -> dict:
    import re
    result = {}
    for k, v in config.items():
        if isinstance(v, str):
            def replacer(m):
                return str(_get_nested(context, m.group(1)) or m.group(0))
            result[k] = re.sub(r"\{\{(.+?)\}\}", replacer, v)
        else:
            result[k] = v
    return result


def _get_nested(data: dict, path: str) -> Any:
    keys = path.split(".")
    cur = data
    for k in keys:
        if isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return None
    return cur


def _topological_sort(nodes: list, edges: list) -> list:
    node_map = {n["id"]: n for n in nodes}
    in_degree = {n["id"]: 0 for n in nodes}
    adj: dict[str, list] = {n["id"]: [] for n in nodes}

    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src and tgt and src in adj:
            adj[src].append(tgt)
            if tgt in in_degree:
                in_degree[tgt] += 1

    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    ordered = []
    while queue:
        nid = queue.pop(0)
        ordered.append(node_map[nid])
        for neighbor in adj.get(nid, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return ordered


def _get_anthropic_key() -> str:
    import os
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY가 설정되지 않았습니다")
    return key

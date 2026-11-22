"""MCP banking workflow resources (static YAML)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.mcp.banking_resources import (
    ALL_BANKING_URIS,
    BANKING_RESOURCES,
    RESOURCE_DIR,
    register_banking_resources,
    resource_uri_from_document,
    resource_version_from_document,
)
from tests.test_investec_mcp_tools import INVESTEC_TOOL_NAMES as INVESTEC_TOOLS


def _load_yaml(filename: str) -> dict:
    path = RESOURCE_DIR / filename
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    assert isinstance(data, dict)
    return data


def test_banking_resource_files_exist_for_every_uri() -> None:
    for uri, filename, *_ in BANKING_RESOURCES:
        path = RESOURCE_DIR / filename
        assert path.is_file(), f"missing {filename} for {uri}"
        body = _load_yaml(filename)
        assert resource_uri_from_document(body) == uri
        assert resource_version_from_document(body)


def test_workflow_registry_links_resolve() -> None:
    registry = _load_yaml("workflow-registry.yaml")
    declared = {entry[0] for entry in BANKING_RESOURCES}
    global_resources = registry.get("global_resources") or []
    assert set(global_resources) <= declared

    workflows = registry.get("workflows") or {}
    for workflow in workflows.values():
        assert workflow["resource"] in declared
        required = workflow.get("required_resources") or []
        assert set(required) <= declared | {workflow["resource"]}


def test_registry_tool_names_are_registered_investec_tools() -> None:
    registry = _load_yaml("workflow-registry.yaml")
    tools = registry.get("mcp_tools_index") or {}
    read_names = set(tools.get("read_only") or [])
    write_names = set(tools.get("write") or [])
    all_names = read_names | write_names
    assert all_names <= INVESTEC_TOOLS

    for name in write_names:
        assert name in {"create_investec_transfer", "create_investec_payment"}


def test_workflow_resources_reference_valid_tool_names() -> None:
    valid = INVESTEC_TOOLS
    for _uri, filename, *_ in BANKING_RESOURCES:
        data = _load_yaml(filename)
        tools_section = data.get("tools")
        if isinstance(tools_section, list):
            for tool_name in tools_section:
                assert tool_name in valid, f"{filename} lists unknown tool {tool_name}"
        workflow = data.get("workflow")
        if isinstance(workflow, dict):
            for step in workflow.values():
                if not isinstance(step, dict):
                    continue
                names = step.get("tools")
                if isinstance(names, list):
                    for tool_name in names:
                        assert tool_name in valid, f"{filename} step lists unknown tool {tool_name}"
                single = step.get("tool")
                if isinstance(single, str):
                    assert single in valid, f"{filename} step lists unknown tool {single}"


def test_register_banking_resources_exposes_all_uris() -> None:
    import asyncio

    from fastmcp import FastMCP

    async def _run() -> None:
        server = FastMCP("test-banking-resources")
        register_banking_resources(server)
        listed = await server.list_resources()
        uris = {str(item.uri) for item in listed}
        assert uris == set(ALL_BANKING_URIS)

        sample = await server.read_resource("budgethq://workflow-registry")
        assert sample.contents
        assert "workflow-registry" in sample.contents[0].content
        assert sample.contents[0].mime_type == "application/yaml"

    asyncio.run(_run())
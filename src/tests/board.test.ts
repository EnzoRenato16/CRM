import { test } from "node:test";
import assert from "node:assert/strict";

import { BOARD_CATALOG, catalogFor } from "../lib/board";

test("board catalog never leaks manager-only cards into the advisor catalog", () => {
  const advisor = catalogFor("advisor");
  const manager = catalogFor("manager");
  assert.ok(advisor.length > 0);
  assert.ok(manager.length > advisor.length, "manager should see strictly more cards");

  const managerOnly = BOARD_CATALOG.filter((e) => !e.roles.includes("advisor"));
  assert.ok(managerOnly.length >= 1, "expected at least one manager-only card");

  const advisorIds = new Set(advisor.map((e) => e.id));
  for (const e of managerOnly) {
    assert.ok(!advisorIds.has(e.id), `manager-only card "${e.id}" leaked into advisor catalog`);
  }
});

test("every catalog entry has a unique id and a non-empty question", () => {
  const ids = new Set<string>();
  for (const e of BOARD_CATALOG) {
    assert.ok(e.question.trim().length > 0, `empty question for ${e.id}`);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
  }
});

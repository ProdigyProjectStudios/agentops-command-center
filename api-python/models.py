"""
Pydantic v2 request/response models.

Mirrors the existing Drizzle schema exactly — no new columns, no new
enum values.  Notable constraints (enforced here so callers get clean
4xx errors, not Postgres exceptions):

  * priority      — must be one of the existing priority enum values
  * department    — free text, no enum (matching the existing TEXT column)
  * request_type  — accepted at intake/triage for classification logic;
                    not stored as its own column (no schema change), but
                    it drives the triage routing decision.

Workflow status values that matter here:
  submitted  → set by POST /intake
  triaged    → set by POST /triage/{workflow_id}
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


PRIORITY_VALUES = Literal["low", "medium", "high", "urgent"]
RISK_LEVEL_VALUES = Literal["low", "medium", "high", "critical"]

CONFIDENCE_THRESHOLD_DEFAULT: float = 0.6


class AssessmentVerdict(BaseModel):
    """Strict schema the LLM response must satisfy."""
    recommendation: str = Field(..., min_length=1, max_length=2000, description="Narrative recommendation")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score 0.0–1.0")
    risks: list[str] = Field(default_factory=list, description="Identified risk factors")
    evidence_references: list[str] = Field(default_factory=list, description="Chunk IDs / snippets used as evidence")
    next_actions: list[str] = Field(default_factory=list, description="Recommended next steps")


class AssessmentResponse(BaseModel):
    assessment_id: int
    workflow_run_id: int
    routing: str
    verdict: AssessmentVerdict
    retrieval_mode: str
    retrieval_chunks_used: int
    approval_request_id: Optional[int]
    workflow_status: str


class IntakeRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500, description="Short title for the operational request")
    description: str = Field(..., min_length=1, max_length=5000, description="Full description of the request")
    department: str = Field(..., min_length=1, max_length=100, description="Originating department (e.g. legal, finance, hr)")
    priority: PRIORITY_VALUES = Field(default="medium", description="Request priority")
    requested_by: str = Field(..., min_length=1, max_length=200, description="Name or identifier of the requester")
    portfolio_company_id: int = Field(..., gt=0, description="ID of the portfolio company this request belongs to")
    request_type: str = Field(default="general", max_length=100, description="Classification hint used by the triage step (e.g. vendor_contract, budget_increase, policy_change)")


class IntakeResponse(BaseModel):
    workflow_run_id: int
    operational_request_id: int
    status: str
    current_stage: str
    portfolio_company_id: int
    title: str
    department: str
    priority: str
    requested_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TriageBody(BaseModel):
    portfolio_company_id: int = Field(
        ..., gt=0,
        description="ID of the portfolio company — used to verify workflow ownership (rejects cross-tenant reads)",
    )
    request_type: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Override classification signal; falls back to the stored department if omitted",
    )


class TriageResponse(BaseModel):
    workflow_run_id: int
    status: str
    current_stage: str
    risk_level: str
    reviewer_tag: str
    routing_rationale: str

    model_config = {"from_attributes": True}


class AgentStepSummary(BaseModel):
    id: int
    name: str
    status: str
    step_index: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class ToolCallSummary(BaseModel):
    id: int
    tool_name: str
    status: str
    output_summary: str
    duration_ms: int
    created_at: datetime


class WorkflowStateResponse(BaseModel):
    workflow_run_id: int
    operational_request_id: int
    title: str
    description: str
    department: str
    priority: str
    requested_by: str
    portfolio_company_id: int
    status: str
    current_stage: str
    risk_level: str
    estimated_cost_cents: int
    final_recommendation: Optional[str]
    summary: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    agent_steps: list[AgentStepSummary]
    tool_calls: list[ToolCallSummary]

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AddProjectPayload,
  NewProjectIntent,
  NewProjectRelationship,
  ProjectKind,
  ProjectOrg,
} from "./types";
import { validateAdd } from "./helpers";

type NewProjectType =
  | "website"
  | "lab_existing"
  | "website_successor"
  | "standalone_app"
  | "internal_tool"
  | "docs_surface"
  | "service_worker"
  | "other";

type ProjectTrack = NewProjectIntent;
type ProjectRelationship = "new" | "successor" | "variant";

const NEW_PROJECT_TYPE_OPTIONS: Array<{
  value: NewProjectType;
  label: string;
}> = [
  { value: "website", label: "new website" },
  { value: "lab_existing", label: "lab based on existing project" },
  {
    value: "website_successor",
    label: "V.x.x website from existing website",
  },
  { value: "standalone_app", label: "standalone app" },
  { value: "internal_tool", label: "internal tool" },
  { value: "docs_surface", label: "docs / knowledge surface" },
  { value: "service_worker", label: "service / worker" },
  { value: "other", label: "other" },
];

function toProjectKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^([^a-z]+)/, "")
    .slice(0, 40);
}

function toTitleCaseFromKey(value: string): string {
  if (!value.trim()) return "";
  return value
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePort(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function projectTypeLabel(projectType: NewProjectType): string {
  switch (projectType) {
    case "website":
      return "New website";
    case "lab_existing":
      return "Lab based on existing project";
    case "website_successor":
      return "V.x.x website from existing website";
    case "standalone_app":
      return "Standalone app";
    case "internal_tool":
      return "Internal tool";
    case "docs_surface":
      return "Docs / knowledge surface";
    case "service_worker":
      return "Service / worker";
    case "other":
    default:
      return "Other";
  }
}

function deriveDefaultsFromProjectType(projectType: NewProjectType): {
  org: ProjectOrg;
  kind: ProjectKind;
  track: ProjectTrack;
  relationship: ProjectRelationship;
  shouldSuggestPort: boolean;
  shouldSuggestUrl: boolean;
  requiresRelatedProject: boolean;
} {
  switch (projectType) {
    case "website":
      return {
        org: "radcon",
        kind: "nextjs",
        track: "production",
        relationship: "new",
        shouldSuggestPort: true,
        shouldSuggestUrl: true,
        requiresRelatedProject: false,
      };
    case "lab_existing":
      return {
        org: "labs",
        kind: "other",
        track: "lab",
        relationship: "variant",
        shouldSuggestPort: false,
        shouldSuggestUrl: false,
        requiresRelatedProject: true,
      };
    case "website_successor":
      return {
        org: "radcon",
        kind: "nextjs",
        track: "production",
        relationship: "successor",
        shouldSuggestPort: true,
        shouldSuggestUrl: true,
        requiresRelatedProject: true,
      };
    case "standalone_app":
      return {
        org: "radcon",
        kind: "tauri",
        track: "production",
        relationship: "new",
        shouldSuggestPort: true,
        shouldSuggestUrl: true,
        requiresRelatedProject: false,
      };
    case "internal_tool":
      return {
        org: "radcon",
        kind: "python",
        track: "production",
        relationship: "new",
        shouldSuggestPort: true,
        shouldSuggestUrl: true,
        requiresRelatedProject: false,
      };
    case "docs_surface":
      return {
        org: "radcon",
        kind: "docs",
        track: "production",
        relationship: "new",
        shouldSuggestPort: false,
        shouldSuggestUrl: false,
        requiresRelatedProject: false,
      };
    case "service_worker":
      return {
        org: "radcon",
        kind: "python",
        track: "production",
        relationship: "new",
        shouldSuggestPort: false,
        shouldSuggestUrl: false,
        requiresRelatedProject: false,
      };
    case "other":
    default:
      return {
        org: "radcon",
        kind: "other",
        track: "production",
        relationship: "new",
        shouldSuggestPort: false,
        shouldSuggestUrl: false,
        requiresRelatedProject: false,
      };
  }
}

function buildDefaultRepoPath(
  org: ProjectOrg,
  key: string,
  projectType: NewProjectType,
): string {
  if (!key) return "";

  if (projectType === "lab_existing") {
    return `/home/chris/dev/rad-empire/labs/projects/${key}`;
  }

  switch (org) {
    case "radcon":
      return `/home/chris/dev/rad-empire/radcon/dev/${key}`;
    case "radwolfe":
      return `/home/chris/dev/rad-empire/radwolfe/dev/${key}`;
    case "labs":
      return `/home/chris/dev/rad-empire/labs/projects/${key}`;
    case "other":
    default:
      return `/home/chris/dev/${key}`;
  }
}

function buildDefaultRepoHint(
  org: ProjectOrg,
  key: string,
  projectType: NewProjectType,
): string {
  if (!key) return "";

  if (projectType === "lab_existing") {
    return `labs/projects/${key}`;
  }

  switch (org) {
    case "radcon":
      return `radcon/dev/${key}`;
    case "radwolfe":
      return `radwolfe/dev/${key}`;
    case "labs":
      return `labs/projects/${key}`;
    case "other":
    default:
      return key;
  }
}

function buildDefaultUrl(
  kind: ProjectKind,
  port: number | undefined,
  shouldSuggestUrl: boolean,
): string {
  if (!shouldSuggestUrl || !port) return "";
  if (kind === "tauri") return `http://127.0.0.1:${port}`;
  return `http://localhost:${port}`;
}

function buildMissionPlaceholder(projectType: NewProjectType): string {
  switch (projectType) {
    case "lab_existing":
      return "Describe the experiment, what base project it depends on, what you want to test safely, and what should be learned before anything is promoted back into a live repo.";
    case "website":
      return "Describe the site mission, users, core surface, what makes it worth building, and what should happen next before scaffolding.";
    case "website_successor":
      return "Describe what this new website version is improving, what existing website it comes from, what should carry forward, and what should change before scaffolding.";
    case "standalone_app":
      return "Describe the app mission, user/operator context, why it should exist as a standalone app, and what should happen next before scaffolding.";
    case "internal_tool":
      return "Describe the workflow problem this tool solves, who will use it, the operating context, and what should happen next before scaffolding.";
    case "docs_surface":
      return "Describe what knowledge this surface should hold, who it is for, what truth it should preserve, and what should happen next before scaffolding.";
    case "service_worker":
      return "Describe the worker/service mission, what it should process or automate, how it fits the larger system, and what should happen next before scaffolding.";
    case "other":
    default:
      return "Describe the mission, intended surface, target users, why this project exists, and what should happen next before scaffolding.";
  }
}

function buildConstraintsPlaceholder(projectType: NewProjectType): string {
  switch (projectType) {
    case "lab_existing":
      return "List constraints, related repo paths, experiment boundaries, non-goals, risks, pattern hints, or what Codex should inspect next.";
    case "website_successor":
      return "List constraints, what must remain compatible, migration concerns, risks, versioning notes, inherited dependencies, and what Codex should inspect next.";
    case "docs_surface":
      return "List constraints, source-of-truth concerns, expected inputs, canonical docs, open questions, and what Codex should inspect next.";
    default:
      return "List constraints, known dependencies, open questions, launch posture, pattern/source hints, or anything Codex should ask about next.";
  }
}

function toIntakeRelationship(
  relationship: ProjectRelationship,
  track: ProjectTrack,
): NewProjectRelationship {
  if (relationship === "successor") return "version_successor";
  if (relationship === "variant" || track === "lab") return "lab_variant";
  return "new";
}

export function AddProjectModal({
  open,
  onClose,
  onCreate,
  defaultSuggestedPort,
  existingProjects,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: AddProjectPayload) => Promise<void> | void;
  defaultSuggestedPort?: number;
  existingProjects: Array<{
    key: string;
    label?: string;
  }>;
}) {
  const [projectType, setProjectType] = useState<NewProjectType>("website");
  const [projectName, setProjectName] = useState("");
  const [mission, setMission] = useState("");
  const [constraints, setConstraints] = useState("");

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [org, setOrg] = useState<ProjectOrg>("radcon");
  const [kind, setKind] = useState<ProjectKind>("nextjs");
  const [track, setTrack] = useState<ProjectTrack>("production");
  const [relationship, setRelationship] = useState<ProjectRelationship>("new");
  const [relatedProject, setRelatedProject] = useState("");
  const [patternHint, setPatternHint] = useState("");
  const [portInput, setPortInput] = useState("");
  const [url, setUrl] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repoHint, setRepoHint] = useState("");
  const [o2StartKey, setO2StartKey] = useState("");
  const [o2SnapshotKey, setO2SnapshotKey] = useState("");
  const [o2CommitKey, setO2CommitKey] = useState("");
  const [o2LabKey, setO2LabKey] = useState("");
  const [o2MapKey, setO2MapKey] = useState("");
  const [o2ProofPackKey, setO2ProofPackKey] = useState("");

  const [labelTouched, setLabelTouched] = useState(false);
  const [orgTouched, setOrgTouched] = useState(false);
  const [kindTouched, setKindTouched] = useState(false);
  const [trackTouched, setTrackTouched] = useState(false);
  const [relationshipTouched, setRelationshipTouched] = useState(false);
  const [portTouched, setPortTouched] = useState(false);
  const [urlTouched, setUrlTouched] = useState(false);
  const [repoPathTouched, setRepoPathTouched] = useState(false);
  const [repoHintTouched, setRepoHintTouched] = useState(false);
  const [o2StartTouched, setO2StartTouched] = useState(false);
  const [o2SnapshotTouched, setO2SnapshotTouched] = useState(false);
  const [o2CommitTouched, setO2CommitTouched] = useState(false);
  const [o2LabTouched, setO2LabTouched] = useState(false);
  const [o2MapTouched, setO2MapTouched] = useState(false);
  const [o2ProofPackTouched, setO2ProofPackTouched] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const defaults = useMemo(
    () => deriveDefaultsFromProjectType(projectType),
    [projectType],
  );

  const shouldShowRelatedProject =
    defaults.requiresRelatedProject ||
    relationship === "successor" ||
    relationship === "variant";

  const shouldShowPort = defaults.shouldSuggestPort;
  const shouldShowUrl = defaults.shouldSuggestUrl;

  useEffect(() => {
    if (!open) return;

    setProjectType("website");
    setProjectName("");
    setMission("");
    setConstraints("");

    setKey("");
    setLabel("");
    setOrg("radcon");
    setKind("nextjs");
    setTrack("production");
    setRelationship("new");
    setRelatedProject("");
    setPatternHint("");
    setPortInput(
      typeof defaultSuggestedPort === "number"
        ? String(defaultSuggestedPort)
        : "",
    );
    setUrl("");
    setRepoPath("");
    setRepoHint("");
    setO2StartKey("");
    setO2SnapshotKey("");
    setO2CommitKey("");
    setO2LabKey("");
    setO2MapKey("");
    setO2ProofPackKey("");

    setLabelTouched(false);
    setOrgTouched(false);
    setKindTouched(false);
    setTrackTouched(false);
    setRelationshipTouched(false);
    setPortTouched(false);
    setUrlTouched(false);
    setRepoPathTouched(false);
    setRepoHintTouched(false);
    setO2StartTouched(false);
    setO2SnapshotTouched(false);
    setO2CommitTouched(false);
    setO2LabTouched(false);
    setO2MapTouched(false);
    setO2ProofPackTouched(false);

    setErr(null);
    setSaving(false);
  }, [open, defaultSuggestedPort]);

  useEffect(() => {
    if (!open) return;
    if (key.trim()) return;

    const nextKey = toProjectKey(projectName);
    if (nextKey) setKey(nextKey);
  }, [open, projectName, key]);

  useEffect(() => {
    if (!open) return;
    if (!orgTouched) setOrg(defaults.org);
    if (!kindTouched) setKind(defaults.kind);
    if (!trackTouched) setTrack(defaults.track);
    if (!relationshipTouched) setRelationship(defaults.relationship);

    if (!portTouched) {
      setPortInput(
        defaults.shouldSuggestPort && typeof defaultSuggestedPort === "number"
          ? String(defaultSuggestedPort)
          : "",
      );
    }
  }, [
    open,
    defaults,
    defaultSuggestedPort,
    orgTouched,
    kindTouched,
    trackTouched,
    relationshipTouched,
    portTouched,
  ]);

  const parsedPort = useMemo(() => normalizePort(portInput), [portInput]);

  const computedLabel = useMemo(() => {
    if (labelTouched) return label;
    if (projectName.trim()) return projectName.trim();
    return toTitleCaseFromKey(key);
  }, [labelTouched, label, projectName, key]);

  const computedRepoPath = useMemo(() => {
    if (repoPathTouched) return repoPath;
    return buildDefaultRepoPath(org, key.trim(), projectType);
  }, [repoPathTouched, repoPath, org, key, projectType]);

  const computedRepoHint = useMemo(() => {
    if (repoHintTouched) return repoHint;
    return buildDefaultRepoHint(org, key.trim(), projectType);
  }, [repoHintTouched, repoHint, org, key, projectType]);

  const computedUrl = useMemo(() => {
    if (urlTouched) return url;
    return buildDefaultUrl(kind, parsedPort, shouldShowUrl);
  }, [urlTouched, url, kind, parsedPort, shouldShowUrl]);

  const computedO2StartKey = useMemo(() => {
    if (o2StartTouched) return o2StartKey;
    return key.trim() ? `${key.trim()}.dev` : "";
  }, [o2StartTouched, o2StartKey, key]);

  const computedO2SnapshotKey = useMemo(() => {
    if (o2SnapshotTouched) return o2SnapshotKey;
    return key.trim() ? `${key.trim()}.snapshot` : "";
  }, [o2SnapshotTouched, o2SnapshotKey, key]);

  const computedO2CommitKey = useMemo(() => {
    if (o2CommitTouched) return o2CommitKey;
    return key.trim() ? `${key.trim()}.commit` : "";
  }, [o2CommitTouched, o2CommitKey, key]);

  const computedO2LabKey = useMemo(() => {
    if (o2LabTouched) return o2LabKey;
    return key.trim() ? `${key.trim()}.lab` : "";
  }, [o2LabTouched, o2LabKey, key]);

  const computedO2MapKey = useMemo(() => {
    if (o2MapTouched) return o2MapKey;
    return key.trim() ? `${key.trim()}.map` : "";
  }, [o2MapTouched, o2MapKey, key]);

  const computedO2ProofPackKey = useMemo(() => {
    if (o2ProofPackTouched) return o2ProofPackKey;
    return key.trim() ? `${key.trim()}.proofpack` : "";
  }, [o2ProofPackTouched, o2ProofPackKey, key]);

  const generatedNotes = useMemo(() => {
    const lines: string[] = [];

    lines.push("Formation Intake");
    lines.push("");
    lines.push(`Project Type: ${projectTypeLabel(projectType)}`);
    lines.push(`Track: ${track}`);
    lines.push(`Relationship: ${relationship}`);

    if (relatedProject.trim()) {
      lines.push(`Related Project: ${relatedProject.trim()}`);
    }

    if (patternHint.trim()) {
      lines.push(`Pattern / Source Hint: ${patternHint.trim()}`);
    }

    lines.push("");
    lines.push("Project Concept / Mission");
    lines.push(mission.trim() || "(required)");

    if (constraints.trim()) {
      lines.push("");
      lines.push("Initial Constraints / Open Questions");
      lines.push(constraints.trim());
    }

    return lines.join("\n").trim();
  }, [
    projectType,
    track,
    relationship,
    relatedProject,
    patternHint,
    mission,
    constraints,
  ]);

  const payload: AddProjectPayload = useMemo(
    () => ({
      key: key.trim(),
      label: computedLabel.trim(),
      org,
      kind,
      repoPath: computedRepoPath.trim(),
      repoHint: computedRepoHint.trim() || undefined,
      port: shouldShowPort ? parsedPort : undefined,
      url: shouldShowUrl ? computedUrl.trim() || undefined : undefined,
      o2StartKey: computedO2StartKey.trim() || undefined,
      o2SnapshotKey: computedO2SnapshotKey.trim() || undefined,
      o2CommitKey: computedO2CommitKey.trim() || undefined,
      o2LabKey: computedO2LabKey.trim() || undefined,
      o2MapKey: computedO2MapKey.trim() || undefined,
      o2ProofPackKey: computedO2ProofPackKey.trim() || undefined,
      projectType,
      intent: track,
      relationship: toIntakeRelationship(relationship, track),
      parentProjectKey: relatedProject.trim() || undefined,
      patternHint: patternHint.trim() || undefined,
      mission: mission.trim(),
      initialConstraints: constraints.trim() || undefined,
      notes: generatedNotes || undefined,
    }),
    [
      key,
      computedLabel,
      org,
      kind,
      computedRepoPath,
      computedRepoHint,
      shouldShowPort,
      parsedPort,
      shouldShowUrl,
      computedUrl,
      computedO2StartKey,
      computedO2SnapshotKey,
      computedO2CommitKey,
      computedO2LabKey,
      computedO2MapKey,
      computedO2ProofPackKey,
      projectType,
      track,
      relationship,
      relatedProject,
      patternHint,
      mission,
      constraints,
      generatedNotes,
    ],
  );

  const validation = useMemo(
    () =>
      validateAdd({
        org: payload.org,
        key: payload.key,
        port: payload.port,
        url: payload.url,
        repo: payload.repoPath,
      }),
    [payload],
  );

  const intakeError = useMemo(() => {
    const errors: string[] = [];

    if (!projectName.trim()) {
      errors.push("Project name is required.");
    }

    if (!mission.trim()) {
      errors.push("Project concept / mission is required.");
    }

    if (!key.trim()) {
      errors.push("Project key is required.");
    }

    if (shouldShowRelatedProject && !relatedProject.trim()) {
      errors.push("Related project is required for this formation path.");
    }

    if (projectType === "lab_existing" && track !== "lab") {
      errors.push("Lab-based formation must stay on the lab track.");
    }

    if (projectType === "lab_existing" && org !== "labs") {
      errors.push(
        "Lab-based formation should live under the labs org by default.",
      );
    }
    if (projectType === "website_successor" && relationship !== "successor") {
      errors.push(
        "Website successor formation must stay on successor relationship.",
      );
    }

    if (projectType === "website_successor" && org !== "radcon") {
      errors.push(
        "Website successor formation should stay under the radcon org by default.",
      );
    }

    if (projectType === "website_successor" && kind !== "nextjs") {
      errors.push(
        "Website successor formation should stay on nextjs kind by default.",
      );
    }
    if (shouldShowPort && !parsedPort) {
      errors.push("Port is required for this project type.");
    }

    return errors.length ? errors.join(" ") : null;
  }, [
    projectName,
    mission,
    key,
    shouldShowRelatedProject,
    relatedProject,
    projectType,
    track,
    org,
    kind,
    shouldShowPort,
    parsedPort,
  ]);

  const validationError = intakeError
    ? intakeError
    : validation.ok
      ? null
      : validation.errors.join(" ");

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  async function submit() {
    if (validationError) {
      setErr(validationError);
      return;
    }

    setErr(null);
    setSaving(true);
    try {
      await onCreate(payload);
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message ?? "")
            : "";

      setErr(
        typeof msg === "string" && msg.trim()
          ? msg
          : "Failed to start formation.",
      );
    } finally {
      setSaving(false);
    }
  }

  const missionPlaceholder = buildMissionPlaceholder(projectType);
  const constraintsPlaceholder = buildConstraintsPlaceholder(projectType);

  const seedArtifactPreview = useMemo(() => {
    return [
      `projectType: ${projectTypeLabel(projectType)}`,
      `name: ${projectName.trim() || "(required)"}`,
      `label: ${computedLabel.trim() || "(required)"}`,
      `key: ${key.trim() || "(required)"}`,
      `org: ${org}`,
      `track: ${track}`,
      `relationship: ${relationship}`,
      `kind: ${kind}`,
      shouldShowRelatedProject
        ? `relatedProject: ${relatedProject.trim() || "(required)"}`
        : null,
      patternHint.trim() ? `patternHint: ${patternHint.trim()}` : null,
      shouldShowPort
        ? parsedPort
          ? `port: ${parsedPort}`
          : "port: (required)"
        : "port: (not needed for this type)",
      shouldShowUrl
        ? computedUrl.trim()
          ? `url: ${computedUrl.trim()}`
          : "url: (auto when port exists)"
        : "url: (not needed for this type)",
      computedRepoPath.trim()
        ? `repoPath: ${computedRepoPath.trim()}`
        : "repoPath: (required)",
      computedRepoHint.trim()
        ? `repoHint: ${computedRepoHint.trim()}`
        : "repoHint: (auto)",
      computedO2StartKey.trim()
        ? `o2StartKey: ${computedO2StartKey.trim()}`
        : "o2StartKey: (auto)",
      computedO2SnapshotKey.trim()
        ? `o2SnapshotKey: ${computedO2SnapshotKey.trim()}`
        : "o2SnapshotKey: (auto)",
      computedO2CommitKey.trim()
        ? `o2CommitKey: ${computedO2CommitKey.trim()}`
        : "o2CommitKey: (auto)",
      computedO2LabKey.trim()
        ? `o2LabKey: ${computedO2LabKey.trim()}`
        : "o2LabKey: (auto)",
      computedO2MapKey.trim()
        ? `o2MapKey: ${computedO2MapKey.trim()}`
        : "o2MapKey: (auto)",
      computedO2ProofPackKey.trim()
        ? `o2ProofPackKey: ${computedO2ProofPackKey.trim()}`
        : "o2ProofPackKey: (auto)",
      "",
      "mission:",
      mission.trim() || "(required)",
      "",
      "constraints:",
      constraints.trim() || "(none yet)",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }, [
    projectType,
    projectName,
    computedLabel,
    key,
    org,
    track,
    relationship,
    kind,
    shouldShowRelatedProject,
    relatedProject,
    patternHint,
    shouldShowPort,
    parsedPort,
    shouldShowUrl,
    computedUrl,
    computedRepoPath,
    computedRepoHint,
    computedO2StartKey,
    computedO2SnapshotKey,
    computedO2CommitKey,
    computedO2LabKey,
    computedO2MapKey,
    computedO2ProofPackKey,
    mission,
    constraints,
  ]);
  if (!open) return null;
  const modalNode = (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">Start Formation</div>
          <button className="btn btnGhost" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="modalBody modalBodySingle">
          <div className="modalColumn">
            <label>Project Type</label>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value as NewProjectType)}
              disabled={saving}
            >
              {NEW_PROJECT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="fieldHelp">
              This is the formation path. It drives the defaults and determines
              whether a base project is required.
            </div>

            {(projectType === "lab_existing" ||
              projectType === "website_successor") && (
              <div className="modalRelatedProjectBlock">
                <label className="modalRelatedLabel">
                  Base / Existing Project
                </label>
                <select
                  value={relatedProject}
                  onChange={(e) => setRelatedProject(e.target.value)}
                  disabled={saving}
                  className="modalRelatedSelect"
                >
                  <option value="">Select base project</option>
                  {existingProjects.map((project) => (
                    <option key={project.key} value={project.key}>
                      {project.label?.trim() || project.key}
                    </option>
                  ))}
                </select>

                <div className="fieldHelp">
                  {projectType === "lab_existing"
                    ? "Choose the existing project this lab effort is based on."
                    : "Choose the existing website this new version is based on."}
                </div>
              </div>
            )}

            <label className="fieldLabelTopLg">Project Name</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="The Biggest Internet Store"
              disabled={saving}
            />

            <div className="fieldHelp">Human-facing name for the project.</div>

            <label className="fieldLabelTop">Label</label>
            <input
              value={computedLabel}
              onChange={(e) => {
                setLabelTouched(true);
                setLabel(e.target.value);
              }}
              placeholder="The Biggest Internet Store"
              disabled={saving}
            />

            <div className="fieldHelp">
              Display label used in the UI. Auto-derived until you override it.
            </div>

            <label className="fieldLabelTop">Key</label>
            <input
              value={key}
              onChange={(e) => setKey(toProjectKey(e.target.value))}
              placeholder="tbis"
              disabled={saving}
            />

            <div className="fieldHelp">
              Short machine key used for repo paths, O2 verbs, and registry
              identity.
            </div>

            <label className="fieldLabelTop">Project Concept / Mission</label>
            <textarea
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              placeholder={missionPlaceholder}
              disabled={saving}
              rows={8}
            />

            <div className="modalGuidedBlock">
              <div className="modalArtifactTitle">Guided Details</div>

              <label className="fieldLabelTop">Pattern / Source Hint</label>
              <input
                value={patternHint}
                onChange={(e) => setPatternHint(e.target.value)}
                placeholder={
                  projectType === "website_successor"
                    ? "What existing site/version should this inherit from?"
                    : projectType === "lab_existing"
                      ? "What existing repo/pattern is this experiment based on?"
                      : "Optional pattern, reference repo, or starting point"
                }
                disabled={saving}
              />

              <div className="fieldHelp">
                Keep this short. Name the closest starting point, pattern, or
                source.
              </div>

              <label className="fieldLabelTop">
                {projectType === "lab_existing"
                  ? "What is being tested / learned?"
                  : projectType === "website_successor"
                    ? "What should carry forward or improve?"
                    : "Initial Constraints / Open Questions"}
              </label>
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder={constraintsPlaceholder}
                disabled={saving}
                rows={5}
              />

              <div className="fieldHelp">
                Keep this focused. Enough truth to start formation, not a full
                spec.
              </div>
            </div>

            <details className="modalArtifact fieldLabelTop">
              <summary className="modalDetailsSummary">
                Generated Details
              </summary>

              <div className="modalGeneratedGrid">
                <div>
                  <div className="modalGeneratedLabel">Track</div>
                  <div className="modalGeneratedValue">{track}</div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">Relationship</div>
                  <div className="modalGeneratedValue">{relationship}</div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">Org</div>
                  <div className="modalGeneratedValue">{org}</div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">Technical Kind</div>
                  <div className="modalGeneratedValue">{kind}</div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">Repo Path</div>
                  <div className="modalGeneratedValue">{computedRepoPath}</div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">Repo Hint</div>
                  <div className="modalGeneratedValue">{computedRepoHint}</div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">Port</div>
                  <div className="modalGeneratedValue">
                    {shouldShowPort
                      ? parsedPort || "(required)"
                      : "(not needed for this type)"}
                  </div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">URL</div>
                  <div className="modalGeneratedValue">
                    {shouldShowUrl
                      ? computedUrl || "(auto from port)"
                      : "(not needed for this type)"}
                  </div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">O2 Start Key</div>
                  <div className="modalGeneratedValue">
                    {computedO2StartKey}
                  </div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">O2 Snapshot Key</div>
                  <div className="modalGeneratedValue">
                    {computedO2SnapshotKey}
                  </div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">O2 Commit Key</div>
                  <div className="modalGeneratedValue">
                    {computedO2CommitKey}
                  </div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">O2 Lab Key</div>
                  <div className="modalGeneratedValue">{computedO2LabKey}</div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">O2 Map Key</div>
                  <div className="modalGeneratedValue">{computedO2MapKey}</div>
                </div>

                <div>
                  <div className="modalGeneratedLabel">O2 Proof Pack Key</div>
                  <div className="modalGeneratedValue">
                    {computedO2ProofPackKey}
                  </div>
                </div>
              </div>

              <div className="modalArtifactPreview">
                <div className="modalArtifactTitle">Seed Artifact Preview</div>
                <pre>{seedArtifactPreview}</pre>
              </div>
            </details>

            {(err || validationError) && (
              <div className="modalErrorBox">{err ?? validationError}</div>
            )}
          </div>
        </div>

        <div className="modalFooter">
          <button
            className="btn btnGhost"
            onClick={onClose}
            disabled={saving}
            type="button"
          >
            Cancel
          </button>

          <button
            className="btn btnPrimary"
            onClick={submit}
            disabled={saving || Boolean(validationError)}
            type="button"
          >
            {saving ? "Starting…" : "Start Formation"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}

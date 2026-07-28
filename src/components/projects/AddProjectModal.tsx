import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AddProjectPayload,
  ProjectAccessModel,
  ProjectClass,
  ProjectDeliverySurface,
  ProjectGoogleWorkspacePlan,
  ProjectOrg,
  ProjectRootOverrides,
  ProjectSecurityPosture,
} from "./types";
import { validateAdd } from "./helpers";


type ProjectShape = "public" | "private" | "operations" | "planning";

const SHAPES: Array<{ value: ProjectShape; label: string; help: string }> = [
  { value: "public", label: "Public website", help: "A public-facing site that starts locally and can be hosted later." },
  { value: "private", label: "Private portal", help: "A website that will require login, roles, or protected information." },
  { value: "operations", label: "Operations website", help: "A local-first dashboard or operational surface with a website interface." },
  { value: "planning", label: "Planning website", help: "A simple local surface for plans, research, or a focused side project." },
];

const LOCATION_OPTIONS: Array<{ value: ProjectOrg; label: string; root: string }> = [
  { value: "radcon", label: "Radcon project", root: "/home/chris/dev/rad-empire/radcon/dev" },
  { value: "radwolfe", label: "Radwolfe project", root: "/home/chris/dev/rad-empire/radwolfe/dev" },
  { value: "other", label: "Playground prototype or test", root: "/home/chris/dev/playground" },
];

const WORKSPACE_OPTIONS: Array<{ value: ProjectGoogleWorkspacePlan; label: string }> = [
  { value: "unknown", label: "Not decided" },
  { value: "no", label: "Not planned" },
  { value: "later", label: "Later" },
  { value: "day_one", label: "Needed now" },
];

function projectKeyFromName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function rootForOrg(org: ProjectOrg, overrides?: ProjectRootOverrides): string {
  return overrides?.[org] ?? (LOCATION_OPTIONS.find((option) => option.value === org)?.root ?? "/home/chris/dev/playground");
}

function classForShape(shape: ProjectShape): ProjectClass {
  switch (shape) {
    case "private": return "private_portal";
    case "operations": return "internal_operations";
    case "planning": return "vacation_plan";
    default: return "business_website";
  }
}

function surfaceForShape(shape: ProjectShape): ProjectDeliverySurface {
  switch (shape) {
    case "private": return "private_portal";
    case "operations": return "operations_workspace";
    case "planning": return "local_dashboard";
    default: return "public_website";
  }
}

export function AddProjectModal({
  open,
  onClose,
  onCreate,
  existingProjects,
  projectRootOverrides,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: AddProjectPayload) => Promise<void> | void;
  existingProjects: Array<{ key: string; label?: string }>;
  projectRootOverrides?: ProjectRootOverrides;
}) {
  const [name, setName] = useState("");
  const [org, setOrg] = useState<ProjectOrg>("radcon");
  const [shape, setShape] = useState<ProjectShape>("public");
  const [referenceProject, setReferenceProject] = useState("");
  const [request, setRequest] = useState("");
  const [domainIntent, setDomainIntent] = useState("");
  const [intendedUsers, setIntendedUsers] = useState("");
  const [workspacePlan, setWorkspacePlan] = useState<ProjectGoogleWorkspacePlan>("unknown");
  const [sensitiveData, setSensitiveData] = useState(false);
  const [constraints, setConstraints] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setOrg("radcon");
    setShape("public");
    setReferenceProject("");
    setRequest("");
    setDomainIntent("");
    setIntendedUsers("");
    setWorkspacePlan("unknown");
    setSensitiveData(false);
    setConstraints("");
    setErr(null);
    setSaving(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const key = useMemo(() => projectKeyFromName(name), [name]);
  const repoPath = useMemo(() => key ? `${rootForOrg(org, projectRootOverrides)}/${key}` : "", [key, org, projectRootOverrides]);
  const selectedShape = SHAPES.find((item) => item.value === shape) ?? SHAPES[0];
  const privateSurface = shape === "private";
  const relationship = referenceProject ? "reference_pattern" : "new";
  const accessModel: ProjectAccessModel = privateSurface ? "role_based_private" : "public";
  const securityPosture: ProjectSecurityPosture = privateSurface || sensitiveData ? "elevated" : "standard";
  const repositoryHint = repoPath.replace("/home/chris/dev/rad-empire/", "").replace("/home/chris/dev/", "");

  const originalRequest = useMemo(() => [
    "Original Project Request",
    "",
    `Name: ${name.trim() || "(required)"}`,
    `Build location: ${repoPath || "(derived after name)"}`,
    `Website shape: ${selectedShape.label}`,
    referenceProject ? `Reference project: ${referenceProject}` : "Reference project: none selected",
    domainIntent.trim() ? `Domain or workspace: ${domainIntent.trim()}` : null,
    intendedUsers.trim() ? `Initial users: ${intendedUsers.trim()}` : null,
    `Google Workspace: ${WORKSPACE_OPTIONS.find((item) => item.value === workspacePlan)?.label ?? workspacePlan}`,
    `Sensitive data: ${sensitiveData ? "yes" : "no"}`,
    "",
    "Request",
    request.trim() || "(required)",
    constraints.trim() ? `\nConstraints\n${constraints.trim()}` : null,
  ].filter((line): line is string => Boolean(line)).join("\n"), [
    name, repoPath, selectedShape.label, referenceProject, domainIntent, intendedUsers, workspacePlan, sensitiveData, request, constraints,
  ]);

  const payload = useMemo<AddProjectPayload>(() => ({
    key,
    label: name.trim(),
    bootstrapNow: true,
    org,
    // Every first build is a localhost website starter. The project can adopt a richer stack later.
    kind: "static",
    repoPath,
    repoHint: repositoryHint || undefined,
    projectType: "new_website",
    intent: "production",
    relationship,
    similarProjectKey: referenceProject || undefined,
    referenceRepos: referenceProject || undefined,
    projectClass: classForShape(shape),
    deliverySurface: surfaceForShape(shape),
    mission: request.trim(),
    goalSummary: "Create a governed localhost website starter and preserve this request for the next build pass.",
    intendedUsers: intendedUsers.trim() || "Owner and invited users to be defined during the next build pass.",
    domainIntent: domainIntent.trim() || undefined,
    googleWorkspacePlan: workspacePlan,
    accessModel,
    securityPosture,
    buildStrategy: "guided_followup",
    needsAuthentication: privateSurface,
    handlesSensitiveData: sensitiveData,
    launchLocalFirst: true,
    shellPreference: "o2_recommend",
    initialSectionSet: "o2_recommend",
    initialConstraints: constraints.trim() || undefined,
    notes: originalRequest,
  }), [
    key, name, org, repoPath, repositoryHint, relationship, referenceProject, shape, request,
    intendedUsers, domainIntent, workspacePlan, accessModel, securityPosture, privateSurface,
    sensitiveData, constraints, originalRequest,
  ]);

  const validationError = useMemo(() => {
    const errors: string[] = [];
    if (!name.trim()) errors.push("Project name is required.");
    if (!key) errors.push("Use a project name containing letters or numbers.");
    if (!request.trim()) errors.push("Describe what you want built.");
    const validation = validateAdd({ org, key, repo: repoPath });
    if (!validation.ok) errors.push(...validation.errors);
    return errors.join(" ") || null;
  }, [name, key, request, org, repoPath]);

  async function submit() {
    if (validationError) { setErr(validationError); return; }
    setErr(null);
    setSaving(true);
    try {
      await onCreate(payload);
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Project build could not start.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="modalOverlay" role="dialog" aria-modal="true" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <div className="modalCard" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">Build Project</div>
          <button className="btn btnGhost" data-testid="modal-close" onClick={onClose} disabled={saving}>Close</button>
        </div>
        <div className="modalBody modalBodySingle">
          <div className="modalColumn modalStack">
            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Build Setup</div>
              <div className="modalInlineGrid">
                <div>
                  <label>Project name</label>
                  <input data-testid="modal-project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Radcon Enterprises" disabled={saving} autoFocus />
                </div>
                <div>
                  <label>Build location</label>
                  <select value={org} onChange={(event) => setOrg(event.target.value as ProjectOrg)} disabled={saving}>
                    {LOCATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="modalGeneratedGrid fieldLabelTop">
                <div>
                  <div className="modalGeneratedLabel">Repo</div>
                  <div className="modalGeneratedValue" data-testid="modal-project-repo">{repoPath || "Enter a project name"}</div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Localhost</div>
                  <div className="modalGeneratedValue">Port assigned during build</div>
                </div>
              </div>
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">What To Build</div>
              <div className="modalInlineGrid">
                <div>
                  <label>Website shape</label>
                  <select value={shape} onChange={(event) => setShape(event.target.value as ProjectShape)} disabled={saving}>
                    {SHAPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label>Existing project to borrow from</label>
                  <select value={referenceProject} onChange={(event) => setReferenceProject(event.target.value)} disabled={saving}>
                    <option value="">None: build a net-new starter</option>
                    {existingProjects.map((project) => <option key={project.key} value={project.key}>{project.label?.trim() || project.key}</option>)}
                  </select>
                </div>
              </div>
              <label className="fieldLabelTop">Describe what you want built</label>
              <textarea data-testid="modal-project-request" value={request} onChange={(event) => setRequest(event.target.value)} disabled={saving} className="modalCompactTextArea" placeholder="Goal, audience, pages, features, ideas, and anything important." />
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Project Context</div>
              <div className="modalInlineGrid fieldLabelTop">
                <div>
                  <label>Domain or workspace</label>
                  <input value={domainIntent} onChange={(event) => setDomainIntent(event.target.value)} placeholder="radconenterprises.com or a Google Workspace" disabled={saving} />
                </div>
                <div>
                  <label>Google Workspace timing</label>
                  <select value={workspacePlan} onChange={(event) => setWorkspacePlan(event.target.value as ProjectGoogleWorkspacePlan)} disabled={saving}>
                    {WORKSPACE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>
              <label className="fieldLabelTop">Initial users</label>
              <input value={intendedUsers} onChange={(event) => setIntendedUsers(event.target.value)} placeholder="Customers, family, partners, staff, or another audience" disabled={saving} />
              <label className="modalCheckboxLabel fieldLabelTop">
                <input type="checkbox" checked={sensitiveData} onChange={(event) => setSensitiveData(event.target.checked)} disabled={saving} />
                <span>Handles sensitive or private information</span>
              </label>
              <label className="fieldLabelTop">Non-negotiable constraints</label>
              <textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} disabled={saving} className="modalShortTextArea" placeholder="Anything the build must avoid, preserve, or solve." />
            </section>

            {err ? <div className="modalErrorBox">{err}</div> : null}
          </div>
        </div>
        <div className="modalFooter">
          <button className="btn btnPrimary" data-testid="modal-build-project" onClick={() => void submit()} disabled={saving}>{saving ? "Building..." : "BUILD PROJECT"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

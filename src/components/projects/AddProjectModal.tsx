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


type ProjectShape = "public" | "member" | "private" | "operations" | "planning";

const SHAPES: Array<{ value: ProjectShape; label: string; help: string }> = [
  { value: "public", label: "Public website — no accounts", help: "A public product, information, or marketing site." },
  { value: "member", label: "Public website — member accounts", help: "A public product with sign-up, sign-in, and member features." },
  { value: "private", label: "Private portal — invited users", help: "A protected website with roles or private information." },
  { value: "operations", label: "Internal operations tool", help: "A private dashboard or workflow used by operators." },
  { value: "planning", label: "Local prototype or planning tool", help: "A localhost-first experiment without an assumed hosted launch." },
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

function YesNoSelect({ label, value, onChange, disabled }: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label>{label}</label>
      <select value={value ? "yes" : "no"} onChange={(event) => onChange(event.target.value === "yes")} disabled={disabled}>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
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
  const [needsAuthentication, setNeedsAuthentication] = useState(false);
  const [needsAdminSurface, setNeedsAdminSurface] = useState(true);
  const [needsPersistentData, setNeedsPersistentData] = useState(true);
  const [needsFileUploads, setNeedsFileUploads] = useState(false);
  const [needsEmailDelivery, setNeedsEmailDelivery] = useState(false);
  const [needsCommerceSurface, setNeedsCommerceSurface] = useState(false);
  const [needsOperatorSurface, setNeedsOperatorSurface] = useState(true);
  const [needsHostedDelivery, setNeedsHostedDelivery] = useState(true);
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
    setNeedsAuthentication(false);
    setNeedsAdminSurface(true);
    setNeedsPersistentData(true);
    setNeedsFileUploads(false);
    setNeedsEmailDelivery(false);
    setNeedsCommerceSurface(false);
    setNeedsOperatorSurface(true);
    setNeedsHostedDelivery(true);
    setSensitiveData(false);
    setConstraints("");
    setErr(null);
    setSaving(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setNeedsAuthentication(shape === "member" || shape === "private" || shape === "operations");
    setNeedsPersistentData(shape !== "planning");
    setNeedsOperatorSurface(org === "radcon" && shape !== "planning");
    setNeedsHostedDelivery(shape !== "planning");
  }, [open, org, shape]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const key = useMemo(() => projectKeyFromName(name), [name]);
  const repoPath = useMemo(() => key ? `${rootForOrg(org, projectRootOverrides)}/${key}` : "", [key, org, projectRootOverrides]);
  const selectedShape = SHAPES.find((item) => item.value === shape) ?? SHAPES[0];
  const privateSurface = shape === "private" || shape === "operations";
  const relationship = referenceProject ? "reference_project" : "new";
  const accessModel: ProjectAccessModel = shape === "planning"
    ? "local_only"
    : privateSurface
      ? shape === "operations" ? "internal_login" : "role_based_private"
      : needsAuthentication ? "mixed" : "public";
  const securityPosture: ProjectSecurityPosture = needsAuthentication || sensitiveData ? "elevated" : "standard";
  const repositoryHint = repoPath.replace("/home/chris/dev/rad-empire/", "").replace("/home/chris/dev/", "");
  const productSurface = shape === "public" || shape === "member" || shape === "private" ? "standalone" : "none";
  const operatorSurface = needsOperatorSurface ? "embedded" : "none";

  const originalRequest = useMemo(() => [
    "Original Project Request",
    "",
    `Name: ${name.trim() || "(required)"}`,
    `Build location: ${repoPath || "(derived after name)"}`,
    `Website shape: ${selectedShape.label}`,
    `Product surface: ${productSurface}`,
    `Radcon operator surface: ${operatorSurface}`,
    "Foundation blueprint: O2 Modern Web Foundation v1",
    referenceProject ? `Additional reference project: ${referenceProject}` : "Additional reference project: none",
    domainIntent.trim() ? `Domain or workspace: ${domainIntent.trim()}` : null,
    intendedUsers.trim() ? `Initial users: ${intendedUsers.trim()}` : null,
    `Google Workspace: ${WORKSPACE_OPTIONS.find((item) => item.value === workspacePlan)?.label ?? workspacePlan}`,
    `Sensitive data: ${sensitiveData ? "yes" : "no"}`,
    `Member or operator login: ${needsAuthentication ? "yes" : "no"}`,
    `Admin or editor tools: ${needsAdminSurface ? "yes" : "no"}`,
    `Persistent application data: ${needsPersistentData ? "yes" : "no"}`,
    `File uploads: ${needsFileUploads ? "yes" : "no"}`,
    `Transactional email: ${needsEmailDelivery ? "yes" : "no"}`,
    `Commerce or payments: ${needsCommerceSurface ? "yes" : "no"}`,
    `Radcon operator surface: ${needsOperatorSurface ? "yes" : "no"}`,
    `Hosted delivery planned: ${needsHostedDelivery ? "yes" : "no"}`,
    "",
    "Request",
    request.trim() || "(required)",
    constraints.trim() ? `\nConstraints\n${constraints.trim()}` : null,
  ].filter((line): line is string => Boolean(line)).join("\n"), [
    name, repoPath, selectedShape.label, productSurface, operatorSurface, referenceProject, domainIntent, intendedUsers, workspacePlan,
    sensitiveData, needsAuthentication, needsAdminSurface, needsPersistentData, needsFileUploads,
    needsEmailDelivery, needsCommerceSurface, needsOperatorSurface, needsHostedDelivery, request, constraints,
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
    productSurface,
    operatorSurface,
    mission: request.trim(),
    goalSummary: "Create a governed localhost website starter and preserve this request for the next build pass.",
    intendedUsers: intendedUsers.trim() || "Owner and invited users to be defined during the next build pass.",
    domainIntent: domainIntent.trim() || undefined,
    googleWorkspacePlan: workspacePlan,
    accessModel,
    securityPosture,
    buildStrategy: "guided_followup",
    needsAuthentication,
    handlesSensitiveData: sensitiveData,
    launchLocalFirst: true,
    shellPreference: "o2_recommend",
    initialSectionSet: "o2_recommend",
    foundationBlueprint: "o2_web_foundation_v1",
    needsAdminSurface,
    needsCommerceSurface,
    needsKnowledgeSurface: shape === "public" || shape === "member",
    needsPersistentData,
    needsFileUploads,
    needsEmailDelivery,
    needsOperatorSurface,
    needsHostedDelivery,
    initialConstraints: constraints.trim() || undefined,
    notes: originalRequest,
  }), [
    key, name, org, repoPath, repositoryHint, relationship, referenceProject, shape, request,
    intendedUsers, domainIntent, workspacePlan, accessModel, securityPosture, needsAuthentication,
    sensitiveData, productSurface, operatorSurface, needsAdminSurface, needsCommerceSurface, needsPersistentData, needsFileUploads,
    needsEmailDelivery, needsOperatorSurface, needsHostedDelivery, constraints, originalRequest,
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
                  <div className="fieldHelp">{selectedShape.help}</div>
                </div>
                <div>
                  <label>Additional project reference</label>
                  <select value={referenceProject} onChange={(event) => setReferenceProject(event.target.value)} disabled={saving}>
                    <option value="">None — use the O2 blueprint</option>
                    {existingProjects.map((project) => <option key={project.key} value={project.key}>{project.label?.trim() || project.key}</option>)}
                  </select>
                </div>
              </div>
              <div className="modalBlueprintNote">
                <strong>O2 Modern Web Foundation v1</strong>
                <span>Uses the proven repository, security, data, Preview, and operations boundaries learned across DQOTD and the wider empire. Product-specific code is never copied.</span>
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
              <div className="modalArtifactTitle fieldLabelTopLg">Quick architecture decisions</div>
              <div className="modalDecisionGrid">
                <YesNoSelect label="Member or operator login?" value={needsAuthentication} onChange={setNeedsAuthentication} disabled={saving} />
                <YesNoSelect label="Admin or editor tools?" value={needsAdminSurface} onChange={setNeedsAdminSurface} disabled={saving} />
                <YesNoSelect label="Persistent app data?" value={needsPersistentData} onChange={setNeedsPersistentData} disabled={saving} />
                <YesNoSelect label="File or image uploads?" value={needsFileUploads} onChange={setNeedsFileUploads} disabled={saving} />
                <YesNoSelect label="Transactional email?" value={needsEmailDelivery} onChange={setNeedsEmailDelivery} disabled={saving} />
                <YesNoSelect label="Commerce or payments?" value={needsCommerceSurface} onChange={setNeedsCommerceSurface} disabled={saving} />
                <YesNoSelect label="Embedded in Radcon Enterprises?" value={needsOperatorSurface} onChange={setNeedsOperatorSurface} disabled={saving} />
                <YesNoSelect label="Hosted after localhost?" value={needsHostedDelivery} onChange={setNeedsHostedDelivery} disabled={saving} />
                <YesNoSelect label="Sensitive or private data?" value={sensitiveData} onChange={setSensitiveData} disabled={saving} />
              </div>
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

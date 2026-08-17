import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AddProjectPayload,
  ProjectAccessModel,
  ProjectArchetype,
  ProjectClass,
  ProjectDeliverySurface,
  ProjectGoogleWorkspacePlan,
  ProjectOrg,
  ProjectRootOverrides,
  ProjectSecurityPosture,
} from "./types";
import { validateAdd } from "./helpers";
import { architectureForOperationsPlacement, type OperationsPlacement } from "./formationPayload";
import type { FormationPreviewResult } from "./projectIntentPreview";


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

function archetypeForShape(shape: ProjectShape, operationsPlacement: OperationsPlacement): ProjectArchetype {
  if (shape === "operations") return architectureForOperationsPlacement(operationsPlacement).projectArchetype;
  if (shape === "planning") return "prototype";
  return "standalone-product";
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
  onReview,
  existingProjects,
  projectRootOverrides,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: AddProjectPayload) => Promise<void> | void;
  onReview: (payload: AddProjectPayload) => Promise<FormationPreviewResult>;
  existingProjects: Array<{ key: string; label?: string }>;
  projectRootOverrides?: ProjectRootOverrides;
}) {
  const [name, setName] = useState("");
  const [org, setOrg] = useState<ProjectOrg>("radcon");
  const [shape, setShape] = useState<ProjectShape>("public");
  const [operationsPlacement, setOperationsPlacement] = useState<OperationsPlacement>("local");
  const [referenceProject, setReferenceProject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [problem, setProblem] = useState("");
  const [value, setValue] = useState("");
  const [success, setSuccess] = useState("");
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
  const [reviewing, setReviewing] = useState(false);
  const [preview, setPreview] = useState<FormationPreviewResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setOrg("radcon");
    setShape("public");
    setOperationsPlacement("local");
    setReferenceProject("");
    setPurpose("");
    setProblem("");
    setValue("");
    setSuccess("");
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
    setReviewing(false);
    setPreview(null);
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
  const audienceLabel = shape === "operations"
    ? "Who will operate this?"
    : shape === "private"
      ? "Who will use this private portal?"
      : shape === "planning"
        ? "Who is this for?"
        : "Who are the users or customers?";
  const privateSurface = shape === "private" || shape === "operations";
  const operationsArchitecture = architectureForOperationsPlacement(operationsPlacement);
  const relationship = referenceProject ? "reference_project" : "new";
  const accessModel: ProjectAccessModel = shape === "operations"
    ? operationsArchitecture.accessModel
    : shape === "planning"
    ? "local_only"
    : privateSurface
      ? "role_based_private"
      : needsAuthentication ? "mixed" : "public";
  const securityPosture: ProjectSecurityPosture = needsAuthentication || sensitiveData ? "elevated" : "standard";
  const repositoryHint = repoPath.replace("/home/chris/dev/rad-empire/", "").replace("/home/chris/dev/", "");
  const productSurface = shape === "public" || shape === "member" || shape === "private" ? "standalone" : "none";
  const effectiveNeedsOperatorSurface = shape === "operations" ? operationsArchitecture.needsOperatorSurface : needsOperatorSurface;
  const effectiveNeedsHostedDelivery = shape === "operations" ? operationsArchitecture.needsHostedDelivery : needsHostedDelivery;
  const operatorSurface = effectiveNeedsOperatorSurface ? "embedded" : "none";
  const projectArchetype = archetypeForShape(shape, operationsPlacement);
  const deliverySurface = shape === "operations" ? operationsArchitecture.deliverySurface : surfaceForShape(shape);

  const originalRequest = useMemo(() => [
    "Original Project Request",
    "",
    `Name: ${name.trim() || "(required)"}`,
    `Build location: ${repoPath || "(derived after name)"}`,
    `Website shape: ${selectedShape.label}`,
    `Project archetype: ${projectArchetype}`,
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
    `Radcon operator surface: ${effectiveNeedsOperatorSurface ? "yes" : "no"}`,
    `Hosted delivery planned: ${effectiveNeedsHostedDelivery ? "yes" : "no"}`,
    "",
    "Purpose",
    purpose.trim() || "(required)",
    "",
    "Problem / Need",
    problem.trim() || "(required)",
    "",
    "Value",
    value.trim() || "(required)",
    "",
    "Success",
    success.trim() || "(required)",
    constraints.trim() ? `\nConstraints\n${constraints.trim()}` : null,
  ].filter((line): line is string => Boolean(line)).join("\n"), [
    name, repoPath, selectedShape.label, projectArchetype, productSurface, operatorSurface, referenceProject, domainIntent, intendedUsers, workspacePlan,
    sensitiveData, needsAuthentication, needsAdminSurface, needsPersistentData, needsFileUploads,
    needsEmailDelivery, needsCommerceSurface, effectiveNeedsOperatorSurface, effectiveNeedsHostedDelivery,
    purpose, problem, value, success, constraints,
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
    projectArchetype,
    deliverySurface,
    productSurface,
    operatorSurface,
    mission: purpose.trim(),
    problemStatement: problem.trim(),
    valueProposition: value.trim(),
    goalSummary: success.trim(),
    intendedUsers: intendedUsers.trim(),
    domainIntent: domainIntent.trim() || undefined,
    googleWorkspacePlan: workspacePlan,
    accessModel,
    securityPosture,
    buildStrategy: "guided_followup",
    needsAuthentication,
    handlesSensitiveData: sensitiveData,
    launchLocalFirst: true,
    foundationBlueprint: "o2_web_foundation_v1",
    needsAdminSurface,
    needsCommerceSurface,
    needsPersistentData,
    needsFileUploads,
    needsEmailDelivery,
    needsOperatorSurface: effectiveNeedsOperatorSurface,
    needsHostedDelivery: effectiveNeedsHostedDelivery,
    initialConstraints: constraints.trim() || undefined,
    notes: originalRequest,
  }), [
    key, name, org, repoPath, repositoryHint, relationship, referenceProject, shape,
    purpose, problem, value, success,
    intendedUsers, domainIntent, workspacePlan, accessModel, securityPosture, needsAuthentication,
    sensitiveData, projectArchetype, productSurface, operatorSurface, needsAdminSurface, needsCommerceSurface, needsPersistentData, needsFileUploads,
    needsEmailDelivery, effectiveNeedsOperatorSurface, effectiveNeedsHostedDelivery, deliverySurface, constraints, originalRequest,
  ]);

  const validationError = useMemo(() => {
    const errors: string[] = [];
    if (!name.trim()) errors.push("Project name is required.");
    if (!key) errors.push("Use a project name containing letters or numbers.");
    if (!purpose.trim()) errors.push("Describe what you are building.");
    if (!intendedUsers.trim()) errors.push("Describe who this is for.");
    if (!problem.trim()) errors.push("Describe the problem or need.");
    if (!value.trim()) errors.push("Describe the value this will create.");
    if (!success.trim()) errors.push("Describe what success looks like.");
    const validation = validateAdd({ org, key, repo: repoPath });
    if (!validation.ok) errors.push(...validation.errors);
    return errors.join(" ") || null;
  }, [name, key, purpose, intendedUsers, problem, value, success, org, repoPath]);

  async function review() {
    if (validationError) { setErr(validationError); return; }
    setErr(null);
    setReviewing(true);
    try {
      setPreview(await onReview(payload));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Project Intent review could not be loaded.");
    } finally {
      setReviewing(false);
    }
  }

  async function submit() {
    if (validationError) { setErr(validationError); return; }
    setErr(null);
    setSaving(true);
    try {
      if (!preview) throw new Error("Review the O2 Project Intent before building.");
      await onCreate({
        ...payload,
        approvedProjectIntentDigest: preview.projectionDigest,
      });
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
      if (event.target === event.currentTarget && !saving && !reviewing) onClose();
    }}>
      <div className="modalCard" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">Build Project</div>
          <button className="btn btnGhost" data-testid="modal-close" onClick={onClose} disabled={saving || reviewing}>Close</button>
        </div>
        <div className="modalBody modalBodySingle">
          {preview ? (
            <div className="modalColumn modalStack" data-testid="modal-project-review">
              <section className="modalSectionCard">
                <div className="modalArtifactTitle">Review Project Identity</div>
                <div className="modalSectionLead">O2 validated this identity using the same formation boundary that Build will use.</div>
                <div className="modalReviewIdentityGrid">
                  <div><span>Name</span><strong>{preview.projectIdentity.label}</strong></div>
                  <div><span>Project key</span><strong>{preview.projectIdentity.key}</strong></div>
                  <div><span>Architecture role</span><strong>{preview.projectIdentity.projectArchetype}</strong></div>
                  <div><span>Delivery surface</span><strong>{preview.projectIdentity.deliverySurface}</strong></div>
                  <div className="modalReviewIdentityWide"><span>Repository</span><strong>{preview.projectIdentity.repoPath}</strong></div>
                </div>
              </section>
              <section className="modalSectionCard">
                <div className="modalArtifactTitle">Project Intent</div>
                <div className="modalSectionLead">This is O2’s canonical projection. The same digest-bound content will seed the new repository.</div>
                <div className="modalProjectIntentGrid">
                  {preview.projectIntent.sections.map((section) => (
                    <article key={section.key} className="modalProjectIntentSection" data-intent-section={section.key}>
                      <h3>{section.heading}</h3>
                      <div className="modalProjectIntentBody">{section.body}</div>
                    </article>
                  ))}
                </div>
              </section>
              {err ? <div className="modalErrorBox">{err}</div> : null}
            </div>
          ) : (
          <div className="modalColumn modalStack">
            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Build Setup</div>
              <div className="modalInlineGrid">
                <div>
                  <label>Project name</label>
                  <input data-testid="modal-project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Radcon Enterprises" disabled={saving || reviewing} autoFocus />
                </div>
                <div>
                  <label>Build location</label>
                  <select value={org} onChange={(event) => setOrg(event.target.value as ProjectOrg)} disabled={saving || reviewing}>
                    {LOCATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="modalGeneratedGrid fieldLabelTop">
                <div>
                  <div className="modalGeneratedLabel">Architecture role</div>
                  <div className="modalGeneratedValue" data-testid="modal-project-archetype">{projectArchetype}</div>
                </div>
                <div>
                  <div className="modalGeneratedLabel">Repo</div>
                  <div className="modalGeneratedValue" data-testid="modal-project-repo">{repoPath || "Enter a project name"}</div>
                </div>
              </div>
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">What To Build</div>
              <div className="modalInlineGrid">
                <div>
                  <label>Website shape</label>
                  <select value={shape} onChange={(event) => setShape(event.target.value as ProjectShape)} disabled={saving || reviewing}>
                    {SHAPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <div className="fieldHelp">{selectedShape.help}</div>
                  {shape === "operations" ? (
                    <div className="fieldLabelTop">
                      <label>Where will this tool operate?</label>
                      <select data-testid="modal-operations-placement" value={operationsPlacement} onChange={(event) => setOperationsPlacement(event.target.value as OperationsPlacement)} disabled={saving || reviewing}>
                        <option value="local">On this development machine as a local builder or control system</option>
                        <option value="portal">As a private application accessed through Radcon Enterprises</option>
                      </select>
                      <div className="fieldHelp">O2 validates the architecture role before bootstrap.</div>
                    </div>
                  ) : null}
                </div>
                <div>
                  <label>Additional project reference</label>
                  <select value={referenceProject} onChange={(event) => setReferenceProject(event.target.value)} disabled={saving || reviewing}>
                    <option value="">None — use the O2 blueprint</option>
                    {existingProjects.map((project) => <option key={project.key} value={project.key}>{project.label?.trim() || project.key}</option>)}
                  </select>
                </div>
              </div>
              <div className="modalBlueprintNote">
                <strong>O2 Modern Web Foundation v1</strong>
                <span>Uses the proven repository, security, data, Preview, and operations boundaries learned across DQOTD and the wider empire. Product-specific code is never copied.</span>
              </div>
              <label className="fieldLabelTop">What are you building?</label>
              <textarea data-testid="modal-project-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} disabled={saving || reviewing} className="modalCompactTextArea" placeholder="Describe the product, service, tool, or experience in plain language." />
            </section>

            <section className="modalSectionCard">
              <div className="modalArtifactTitle">Project Context</div>
              <div className="modalInlineGrid fieldLabelTop">
                <div>
                  <label>Domain or workspace</label>
                  <input value={domainIntent} onChange={(event) => setDomainIntent(event.target.value)} placeholder="radconenterprises.com or a Google Workspace" disabled={saving || reviewing} />
                </div>
                <div>
                  <label>Google Workspace timing</label>
                  <select value={workspacePlan} onChange={(event) => setWorkspacePlan(event.target.value as ProjectGoogleWorkspacePlan)} disabled={saving || reviewing}>
                    {WORKSPACE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>
              <label className="fieldLabelTop">{audienceLabel}</label>
              <input data-testid="modal-project-users" value={intendedUsers} onChange={(event) => setIntendedUsers(event.target.value)} placeholder="Name the real users, customers, operators, family, or team" disabled={saving || reviewing} />
              <div className="modalInlineGrid fieldLabelTop">
                <div>
                  <label>What problem or need does it address?</label>
                  <textarea data-testid="modal-project-problem" value={problem} onChange={(event) => setProblem(event.target.value)} disabled={saving || reviewing} className="modalShortTextArea" placeholder="What is difficult, missing, fragmented, or worth improving?" />
                </div>
                <div>
                  <label>What value will it create?</label>
                  <textarea data-testid="modal-project-value" value={value} onChange={(event) => setValue(event.target.value)} disabled={saving || reviewing} className="modalShortTextArea" placeholder="What becomes easier, safer, clearer, or more valuable?" />
                </div>
              </div>
              <label className="fieldLabelTop">What will success look like?</label>
              <textarea data-testid="modal-project-success" value={success} onChange={(event) => setSuccess(event.target.value)} disabled={saving || reviewing} className="modalShortTextArea" placeholder="Describe the outcome that would make this project successful." />
              <div className="modalArtifactTitle fieldLabelTopLg">Quick architecture decisions</div>
              <div className="modalDecisionGrid">
                <YesNoSelect label="Member or operator login?" value={needsAuthentication} onChange={setNeedsAuthentication} disabled={saving || reviewing} />
                <YesNoSelect label="Admin or editor tools?" value={needsAdminSurface} onChange={setNeedsAdminSurface} disabled={saving || reviewing} />
                <YesNoSelect label="Persistent app data?" value={needsPersistentData} onChange={setNeedsPersistentData} disabled={saving || reviewing} />
                <YesNoSelect label="File or image uploads?" value={needsFileUploads} onChange={setNeedsFileUploads} disabled={saving || reviewing} />
                <YesNoSelect label="Transactional email?" value={needsEmailDelivery} onChange={setNeedsEmailDelivery} disabled={saving || reviewing} />
                <YesNoSelect label="Commerce or payments?" value={needsCommerceSurface} onChange={setNeedsCommerceSurface} disabled={saving || reviewing} />
                {shape !== "operations" ? <YesNoSelect label="Embedded in Radcon Enterprises?" value={needsOperatorSurface} onChange={setNeedsOperatorSurface} disabled={saving || reviewing} /> : null}
                {shape !== "operations" ? <YesNoSelect label="Hosted after localhost?" value={needsHostedDelivery} onChange={setNeedsHostedDelivery} disabled={saving || reviewing} /> : null}
                <YesNoSelect label="Sensitive or private data?" value={sensitiveData} onChange={setSensitiveData} disabled={saving || reviewing} />
              </div>
              <label className="fieldLabelTop">Non-negotiable constraints</label>
              <textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} disabled={saving || reviewing} className="modalShortTextArea" placeholder="Anything the build must avoid, preserve, or solve." />
            </section>

            {err ? <div className="modalErrorBox">{err}</div> : null}
          </div>
          )}
        </div>
        <div className="modalFooter">
          {preview ? (
            <>
              <button className="btn btnGhost" data-testid="modal-back-to-edit" onClick={() => { setPreview(null); setErr(null); }} disabled={saving || reviewing}>Back to Edit</button>
              <button className="btn btnPrimary" data-testid="modal-build-project" onClick={() => void submit()} disabled={saving || reviewing}>{saving ? "Building..." : "BUILD PROJECT"}</button>
            </>
          ) : (
            <button className="btn btnPrimary" data-testid="modal-review-project" onClick={() => void review()} disabled={reviewing}>{reviewing ? "Reviewing..." : "REVIEW PROJECT"}</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

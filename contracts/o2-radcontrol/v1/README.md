# RadControl O2 client contract v1

`client.json` declares the O2 protocol range and capabilities required by this
RadControl release. The frontend validates O2's `contract_info` response before
any operational command is dispatched.

The client contract also declares the exact operator-visible project and launch-
surface keys required by the release. O2's governed `list_projects` response is
the actual runtime roster; RadControl compares that response with the independent
client requirement and reports attention on a missing, extra, or duplicate key.
The three `-backend` entries are logical launch surfaces from the existing
Radcon portal contract, not additional repositories or data authorities.

A breaking O2 command or response change requires a new versioned contract, not
an in-place edit to v1 semantics.

`project_create.bootstrap` success includes additive
`learningInheritance` evidence. RadControl fails closed unless it identifies
router contract v1, the exact project and archetype, an initial quality
profile, `docs/REPO_STATE.md` as product authority, User Correction Learning
Contract v1, bounded correction/roadblock/quality routes, correction closeout,
human-reviewed promotion, source ownership, conformant status, and host-local
memory that is explicitly non-authoritative and not inherited or initialized
per project.

This validation changes no visible New Project fields. O2 remains the source
of the evidence; RadControl does not persist a parallel policy or memory store.

Additive Empire To-Do and Sentinel capabilities use the same compatibility
handshake. Empire To-Do uses an stdin-backed validated structured save.
Sentinel exposes fixed Level-0 observation verbs, deterministic Ask Sentinel,
and a policy-only dry-run endpoint. No advertised Sentinel capability provides
root, arbitrary shell, provider mutation, or a background scheduler.

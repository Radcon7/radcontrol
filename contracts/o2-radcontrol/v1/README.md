# RadControl O2 client contract v1

`client.json` declares the O2 protocol range and capabilities required by this
RadControl release. The frontend validates O2's `contract_info` response before
any operational command is dispatched.

A breaking O2 command or response change requires a new versioned contract, not
an in-place edit to v1 semantics.

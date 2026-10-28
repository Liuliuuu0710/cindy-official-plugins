// Cindy does not run OpenDesign's daemon or analytics consent authority.
// Keep the viewer integration hooks inert: do not transmit project/error metadata.
export function reportExperienceFailure(..._args: unknown[]): void {}
export function reportExperienceEvent(..._args: unknown[]): void {}
export function reportProjectFailure(..._args: unknown[]): void {}
export function resetExperienceDiagnosticsForTests(): void {}

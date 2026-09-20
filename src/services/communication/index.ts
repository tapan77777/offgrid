export { CommunicationManager } from './CommunicationManager';
export type {
  CommunicationEvent,
  CommunicationEventListener,
  CommunicationManagerOptions,
} from './CommunicationManager';
export type {
  Transport,
  TransportEvent,
  TransportEventListener,
} from './types';
export {
  DIAGNOSTIC_GROUP_ID,
  DIAGNOSTIC_GROUP_NAME,
  DIAGNOSTIC_USER_ID,
  DIAGNOSTIC_USER_NAME,
  SETTING_PHASE3_DIAGNOSTICS_ENABLED,
  ensureDiagnosticGroup,
  ensureRemoteDeviceRow,
  isDiagnosticsEnabled,
  setDiagnosticsEnabled,
} from './testGroup';
export { decodeTestPing, encodeTestPing } from './codec';

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
export {
  decodeEnvelope,
  decodeTestPing,
  encodeEnvelope,
  encodeTestPing,
  validateEnvelope,
} from './codec';
export { RelayRouter } from './RelayRouter';
export type {
  RelayRouterEvent,
  RelayRouterListener,
  RelayRouterOptions,
} from './RelayRouter';

// Chat V1 (D-074). Re-exported through the communication barrel so consumers
// only need one import path for both transport-layer types and the chat
// services that sit on top of them.
export {
  ensureDirectConversation,
  DirectConversationInvariantError,
  sendChatText,
  ChatSendValidationError,
  startChatMessageReceiver,
  startChatOutbox,
  CHAT_OUTBOX_LOCAL_TIMEOUT_MS,
  startChatRuntime,
} from '../chat';
export type {
  EnsureDirectConversationInput,
  ChatSendStatus,
  SendChatTextInput,
  SendChatTextOutcome,
  StartChatMessageReceiverOptions,
  ChatOutboxHandle,
  StartChatOutboxOptions,
  StartChatRuntimeOptions,
} from '../chat';

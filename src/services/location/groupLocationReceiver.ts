import type { OffgridDb } from '../../database';
import type { CommunicationManager } from '../communication/CommunicationManager';
import { receiveGroupLocationEnvelope } from './groupLocationTransport';
import type { ReceiveGroupLocationOutcome } from './groupLocationTransport';

// Wires the `groupLocationEnvelopeReceived` event from a
// CommunicationManager to the receiver service so that peer locations are
// validated + persisted with source='peer'. Outcomes are forwarded through
// the optional callback so a diagnostic surface can log accepted /
// duplicate / rejected envelopes without needing to re-run validation.
//
// Returns the unsubscribe handle for callers to invoke on unmount.

export interface AttachGroupLocationReceiverOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager;
  readonly onOutcome?: (outcome: ReceiveGroupLocationOutcome) => void;
  readonly nowIso?: () => string;
}

export function attachGroupLocationReceiver(
  options: AttachGroupLocationReceiverOptions,
): () => void {
  return options.manager.on(event => {
    if (event.kind !== 'groupLocationEnvelopeReceived') return;
    const outcome = receiveGroupLocationEnvelope({
      db: options.db,
      envelope: event.envelope,
      ...(options.nowIso ? { nowIso: options.nowIso } : {}),
    });
    options.onOutcome?.(outcome);
  });
}

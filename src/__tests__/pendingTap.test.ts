import { setPendingChatTap, consumePendingChatTap, subscribePendingChatTap } from '../services/notifications/pendingTap';

describe('pendingTap (notification-tap → deferred chat open)', () => {
  afterEach(() => {
    consumePendingChatTap(); // drain between tests (module-level singleton)
  });

  it('latches a conversation and consumes it exactly once', () => {
    setPendingChatTap('c1');
    expect(consumePendingChatTap()).toBe('c1');
    expect(consumePendingChatTap()).toBeNull();
  });

  it('keeps only the most recent tap', () => {
    setPendingChatTap('c1');
    setPendingChatTap('c2');
    expect(consumePendingChatTap()).toBe('c2');
  });

  it('notifies subscribers on latch and stops after unsubscribe', () => {
    const seen: string[] = [];
    const unsub = subscribePendingChatTap(() => {
      const id = consumePendingChatTap();
      if (id) seen.push(id);
    });
    setPendingChatTap('c1');
    expect(seen).toEqual(['c1']);
    unsub();
    setPendingChatTap('c2');
    expect(seen).toEqual(['c1']); // listener gone; tap stays latched for the next consumer
    expect(consumePendingChatTap()).toBe('c2');
  });
});

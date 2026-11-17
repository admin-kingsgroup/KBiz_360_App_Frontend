import { openChatWith, type ChatOpenNav } from '../logic/openChatRoute';

// A notification tap (or a call's "message" action) opens a chat from outside the chat lists. On a
// wide window (the iPhone Duo opened) that must be the Chats tab with the chat in its right pane,
// not the chat screen over the whole window; on a phone-width one, the chat screen as before.
function fakeNav(canDismiss: boolean) {
  const calls: string[] = [];
  const nav: ChatOpenNav = {
    navigate: (href) => { calls.push(`navigate ${JSON.stringify(href)}`); },
    dismissAll: () => { calls.push('dismissAll'); },
    canDismiss: () => canDismiss,
  };
  return { nav, calls };
}

describe('openChatWith', () => {
  it('phone width: navigates to the chat screen', () => {
    const { nav, calls } = fakeNav(true);
    const pane = jest.fn();
    openChatWith(nav, false, pane, 'c1');
    expect(calls).toEqual([`navigate ${JSON.stringify({ pathname: '/chat/[id]', params: { id: 'c1' } })}`]);
    expect(pane).not.toHaveBeenCalled();
  });

  it('phone width: lands on a message when given one', () => {
    const { nav, calls } = fakeNav(false);
    openChatWith(nav, false, jest.fn(), 'c1', 'm9');
    expect(calls).toEqual([`navigate ${JSON.stringify({ pathname: '/chat/[id]', params: { id: 'c1', messageId: 'm9' } })}`]);
  });

  it('wide: opens the chat in the pane, closes the screens on top, and shows the Chats tab', () => {
    const { nav, calls } = fakeNav(true);
    const pane = jest.fn();
    openChatWith(nav, true, pane, 'c1', 'm9');
    expect(pane).toHaveBeenCalledWith('c1', 'm9');
    expect(calls).toEqual(['dismissAll', `navigate ${JSON.stringify('/(tabs)')}`]);
  });

  it('wide, already at the tabs: nothing to dismiss', () => {
    const { nav, calls } = fakeNav(false);
    openChatWith(nav, true, jest.fn(), 'c1');
    expect(calls).toEqual([`navigate ${JSON.stringify('/(tabs)')}`]);
  });

  it('ignores an empty id', () => {
    const { nav, calls } = fakeNav(true);
    const pane = jest.fn();
    openChatWith(nav, true, pane, '');
    expect(calls).toEqual([]);
    expect(pane).not.toHaveBeenCalled();
  });
});

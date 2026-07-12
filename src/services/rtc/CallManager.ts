import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import type { MediaStream, MediaStreamTrack } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import type { Socket } from 'socket.io-client';
import { initiateCall, acceptCall, rejectCall, endCall, getIceServers, type CallParticipant, type CallMediaType, type IceServer } from '../../api/calls';
import { useCallSessionStore } from '../../store/callSessionStore';
import { isCallKitActive, endCallKit, reportCallKitConnected } from '../iosCallKeep';

// Socket event names — must match the backend (src/mongo/calls/call.types.ts CALL_EVENTS).
const EV = {
  INCOMING: 'call:incoming',
  ACCEPT: 'call:accept',
  REJECT: 'call:reject',
  END: 'call:end',
  MISSED: 'call:missed',
  OFFER: 'call:offer',
  ANSWER: 'call:answer',
  ICE: 'call:ice-candidate',
} as const;

interface SignalIn { callId: string; from: string; sdp?: { type: string; sdp: string }; candidate?: unknown }

// Single orchestrator for one call at a time. Owns the RTCPeerConnection, local mic stream, ICE
// negotiation and audio session (InCallManager). The lifecycle is REST-authoritative (initiate/
// accept/reject/end); SDP offer/answer and ICE candidates are relayed peer-to-peer over the socket.
// All UI reads `callSessionStore`; this service never navigates.
class CallManager {
  private socket: Socket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private callId: string | null = null;
  private peerId: string | null = null;
  private isCaller = false;
  private pendingCandidates: RTCIceCandidate[] = [];
  private iceServers: IceServer[] = [];
  private pendingAcceptCallId: string | null = null; // set by a notification "Accept" before the call arrives over socket

  private get store() { return useCallSessionStore.getState(); }

  // ─── socket wiring (called by chatSocket on connect/disconnect) ───
  attach(socket: Socket): void {
    this.socket = socket;
    socket.on(EV.INCOMING, this.onIncoming);
    socket.on(EV.ACCEPT, this.onAccepted);
    socket.on(EV.REJECT, this.onRejected);
    socket.on(EV.END, this.onEnded);
    socket.on(EV.MISSED, this.onMissed);
    socket.on(EV.OFFER, this.onOffer);
    socket.on(EV.ANSWER, this.onAnswer);
    socket.on(EV.ICE, this.onRemoteCandidate);
  }
  detach(): void {
    const s = this.socket;
    if (!s) return;
    [EV.INCOMING, EV.ACCEPT, EV.REJECT, EV.END, EV.MISSED, EV.OFFER, EV.ANSWER, EV.ICE].forEach((e) => s.off(e));
    this.socket = null;
  }
  private emit(event: string, payload: unknown): void { this.socket?.emit(event, payload); }

  // ─── public actions (called from UI) ───

  // Start an outgoing call to a contact.
  async startOutgoing(receiver: CallParticipant, type: CallMediaType = 'voice'): Promise<void> {
    if (this.store.active) return; // already in a call
    // eslint-disable-next-line no-console
    console.log('[call] startOutgoing →', receiver.id, type, 'socket?', !!this.socket);
    try {
      const { call, iceServers } = await initiateCall(receiver.id, type);
      // eslint-disable-next-line no-console
      console.log('[call] initiated callId=', call.callId);
      this.callId = call.callId;
      this.peerId = receiver.id;
      this.isCaller = true;
      this.iceServers = iceServers;
      this.store.setActive({ callId: call.callId, peer: receiver, type, direction: 'outgoing', phase: 'calling', startedAt: Date.now(), connectedAt: null });
      await this.setupPeer(iceServers);
      InCallManager.start({ media: 'audio' });
      InCallManager.startRingback('_DTMF_'); // local ringback while the callee's phone rings
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[call] startOutgoing FAILED:', (e as Error).message);
      this.fail((e as Error).message || 'Could not start call');
    }
  }

  // Accept the current incoming call.
  async acceptIncoming(): Promise<void> {
    const inc = this.store.incoming;
    if (!inc) return;
    try {
      await acceptCall(inc.callId);
      this.callId = inc.callId;
      this.peerId = inc.caller.id;
      this.isCaller = false;
      const { iceServers } = await getIceServers();
      this.iceServers = iceServers;
      this.store.setIncoming(null);
      this.store.setActive({ callId: inc.callId, peer: inc.caller, type: inc.type, direction: 'incoming', phase: 'connecting', startedAt: inc.startedAt, connectedAt: null });
      InCallManager.stopRingtone();
      await this.setupPeer(iceServers);
      // Under iOS CallKit, CallKit owns the audio session — starting InCallManager here grabs it first
      // and breaks call audio. Defer to the CallKit 'didActivateAudioSession' event (onAudioSessionActivated).
      if (!isCallKitActive()) InCallManager.start({ media: 'audio' });
      // The caller sends the SDP offer once it receives call:accept → we answer in onOffer().
    } catch (e) {
      this.fail((e as Error).message || 'Could not accept call');
    }
  }

  // From a notification action button. On a cold start the call:incoming socket event may not have
  // arrived yet, so we accept/decline as soon as it does (or immediately if already present).
  acceptFromNotification(callId: string): void {
    if (this.store.incoming?.callId === callId) { this.pendingAcceptCallId = null; void this.acceptIncoming(); }
    else this.pendingAcceptCallId = callId;
  }
  declineFromNotification(callId: string): void {
    this.pendingAcceptCallId = null;
    if (this.store.incoming?.callId === callId) { InCallManager.stopRingtone(); this.store.setIncoming(null); }
    void rejectCall(callId).catch(() => undefined);
  }

  // From the iOS CallKit "end" button — it covers both declining a ringing call AND hanging up an
  // active one (CallKit has a single end action), so route to the right teardown.
  declineOrEndFromNotification(callId: string): void {
    if (this.store.active?.callId === callId) { void this.end(); return; }
    this.declineFromNotification(callId);
  }

  // iOS CallKit activated its audio session → now safe to start our audio route (see acceptIncoming).
  onAudioSessionActivated(): void {
    InCallManager.start({ media: 'audio' });
  }

  // System (CallKit) mute toggle → mirror into the call.
  setMutedFromSystem(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t: MediaStreamTrack) => { t.enabled = !muted; });
    this.store.setMuted(muted);
  }

  // Decline the current incoming call.
  async reject(): Promise<void> {
    const inc = this.store.incoming;
    if (!inc) return;
    InCallManager.stopRingtone();
    this.store.setIncoming(null);
    try { await rejectCall(inc.callId); } catch { /* ignore */ }
  }

  // Hang up the active call (also cancels an outgoing call before it connects).
  async end(): Promise<void> {
    const callId = this.callId ?? this.store.active?.callId;
    this.teardown('ended');
    if (callId) { try { await endCall(callId); } catch { /* ignore */ } }
  }

  toggleMute(): void {
    const next = !this.store.muted;
    this.localStream?.getAudioTracks().forEach((t: MediaStreamTrack) => { t.enabled = !next; });
    this.store.setMuted(next);
  }

  toggleSpeaker(): void {
    const next = !this.store.speaker;
    InCallManager.setForceSpeakerphoneOn(next);
    this.store.setSpeaker(next);
  }

  // ─── peer connection ───
  private async setupPeer(iceServers: IceServer[]): Promise<void> {
    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;

    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    this.localStream = stream;
    stream.getTracks().forEach((t: MediaStreamTrack) => pc.addTrack(t, stream));

    // Outgoing ICE candidates → relay to the peer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pc as any).addEventListener('icecandidate', (e: any) => {
      if (e?.candidate && this.callId && this.peerId) {
        this.emit(EV.ICE, { callId: this.callId, to: this.peerId, candidate: e.candidate });
      }
    });
    // Promote to "active" once media can flow. Idempotent — both connectionState and iceConnectionState
    // call this, because RN-WebRTC does not reliably fire connectionState 'connected' (the cause of
    // calls getting stuck on "connecting"); ICE state is the dependable signal.
    const onConnected = (): void => {
      if (this.store.active?.phase === 'active') return;
      this.store.patchActive({ phase: 'active', connectedAt: this.store.active?.connectedAt ?? Date.now() });
      this.store.setQuality('good');
      InCallManager.stopRingback();
      reportCallKitConnected(this.callId); // CallKit: stop "connecting…", start the timer (iOS)
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pc as any).addEventListener('connectionstatechange', () => {
      const state = pc.connectionState;
      if (state === 'connected') onConnected();
      else if (state === 'disconnected') { this.store.patchActive({ phase: 'reconnecting' }); this.store.setQuality('poor'); }
      else if (state === 'failed') void this.attemptIceRestart();
      else if (state === 'closed') this.teardown('ended');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pc as any).addEventListener('iceconnectionstatechange', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ice = (pc as any).iceConnectionState as string;
      if (ice === 'connected' || ice === 'completed') onConnected();
      else if (ice === 'disconnected') { this.store.patchActive({ phase: 'reconnecting' }); this.store.setQuality('poor'); }
      else if (ice === 'failed') void this.attemptIceRestart();
      else if (ice === 'closed') this.teardown('ended');
    });
  }

  // Network blip recovery: caller renegotiates with an ICE restart; if it can't recover, end.
  private async attemptIceRestart(): Promise<void> {
    const pc = this.pc;
    if (!pc || !this.callId || !this.peerId) { this.teardown('failed'); return; }
    this.store.patchActive({ phase: 'reconnecting' });
    try {
      if (this.isCaller) {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        this.emit(EV.OFFER, { callId: this.callId, to: this.peerId, sdp: { type: offer.type, sdp: offer.sdp } });
      }
      // Give it a window to recover; otherwise tear down. Check the STORE phase (set by either
      // connectionState or iceConnectionState) rather than the unreliable pc.connectionState — so a
      // call that recovered via ICE isn't wrongly killed.
      setTimeout(() => {
        if (this.pc && this.store.active?.phase !== 'active') this.fail('Connection lost');
      }, 12000);
    } catch {
      this.fail('Connection lost');
    }
  }

  // ─── socket event handlers ───
  private onIncoming = (p: { callId: string; type: CallMediaType; caller: CallParticipant; startedAt: number }): void => {
    // eslint-disable-next-line no-console
    console.log('[call] onIncoming callId=', p.callId, 'from', p.caller?.name, '| busy?', !!(this.store.active || this.store.incoming));
    if (this.store.active || this.store.incoming) { void rejectCall(p.callId).catch(() => undefined); return; } // busy
    this.store.setIncoming({ callId: p.callId, type: p.type, caller: p.caller, startedAt: p.startedAt });
    // On iOS the native CallKit screen rings; don't double-ring with the in-app ringtone.
    if (!isCallKitActive()) InCallManager.startRingtone('_DEFAULT_', [0, 1000, 1000], 'playback', 30);
    // If the user already tapped "Accept" on the notification (cold start), answer now.
    if (this.pendingAcceptCallId === p.callId) { this.pendingAcceptCallId = null; void this.acceptIncoming(); }
  };

  private onAccepted = async (p: { callId: string }): Promise<void> => {
    if (p.callId !== this.callId || !this.pc || !this.isCaller) return;
    InCallManager.stopRingback();
    this.store.patchActive({ phase: 'connecting' });
    try {
      const offer = await this.pc.createOffer({});
      await this.pc.setLocalDescription(offer);
      this.emit(EV.OFFER, { callId: this.callId, to: this.peerId, sdp: { type: offer.type, sdp: offer.sdp } });
    } catch (e) {
      this.fail((e as Error).message || 'Negotiation failed');
    }
  };

  private onOffer = async (p: SignalIn): Promise<void> => {
    if (p.callId !== this.callId || !this.pc || !p.sdp) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
      await this.flushCandidates();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.emit(EV.ANSWER, { callId: this.callId, to: this.peerId, sdp: { type: answer.type, sdp: answer.sdp } });
    } catch (e) {
      this.fail((e as Error).message || 'Negotiation failed');
    }
  };

  private onAnswer = async (p: SignalIn): Promise<void> => {
    if (p.callId !== this.callId || !this.pc || !p.sdp) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
      await this.flushCandidates();
    } catch (e) {
      // Initial answer failing = call can't connect → fail loudly instead of hanging on "connecting".
      // A failed answer during an ICE restart (already active) must NOT kill the working call.
      if (this.store.active?.phase !== 'active') this.fail((e as Error).message || 'Negotiation failed');
    }
  };

  private onRemoteCandidate = async (p: SignalIn): Promise<void> => {
    if (p.callId !== this.callId || !p.candidate) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cand = new RTCIceCandidate(p.candidate as any);
    if (this.pc?.remoteDescription) {
      try { await this.pc.addIceCandidate(cand); } catch { /* ignore */ }
    } else {
      this.pendingCandidates.push(cand);
    }
  };

  private onRejected = (p: { callId: string }): void => { if (p.callId === this.callId) this.teardown('Call declined'); };
  private onEnded = (p: { callId: string }): void => { if (p.callId === this.callId) this.teardown('Call ended'); };
  private onMissed = (p: { callId: string }): void => {
    if (this.store.incoming?.callId === p.callId) { InCallManager.stopRingtone(); this.store.setIncoming(null); }
    if (p.callId === this.callId) this.teardown('Missed call');
  };

  private async flushCandidates(): Promise<void> {
    if (!this.pc) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of queued) { try { await this.pc.addIceCandidate(c); } catch { /* ignore */ } }
  }

  // ─── teardown ───
  private fail(reason: string): void { this.teardown(reason); }

  private teardown(reason: string): void {
    endCallKit(this.callId ?? this.store.active?.callId ?? this.store.incoming?.callId); // dismiss the iOS CallKit screen
    InCallManager.stopRingback();
    InCallManager.stopRingtone();
    this.localStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    if (this.pc) { try { this.pc.close(); } catch { /* ignore */ } }
    InCallManager.stop();

    this.pc = null;
    this.localStream = null;
    this.pendingCandidates = [];
    this.callId = null;
    this.peerId = null;
    this.isCaller = false;

    // Briefly surface the 'ended' state, then clear so the in-call screen can dismiss.
    if (this.store.active) {
      this.store.patchActive({ phase: 'ended', endReason: reason });
      setTimeout(() => { useCallSessionStore.getState().reset(); }, 1200);
    } else {
      this.store.reset();
    }
  }
}

export const callManager = new CallManager();

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/app/lib/socket";

type RemoteStreamMap = Record<string, MediaStream>;
type PeerNameMap = Record<string, string>;
type PeerShareMap = Record<string, boolean>;
type PeerVideoEnabledMap = Record<string, boolean>;

export type RoomJoinIntent = "create" | "join";
export type RoomRole = "host" | "participant";
export type RoomEntryState =
  | "idle"
  | "joining"
  | "waiting"
  | "joined"
  | "room-not-found"
  | "name-taken"
  | "invalid-room"
  | "invalid-name"
  | "error"
  | "revoked";

export type RoomParticipant = {
  id: string;
  name: string;
  role: RoomRole;
};

export type PendingParticipant = {
  id: string;
  name: string;
  requestedAt: number;
};

type JoinRoomResponse = {
  status?: string;
  role?: RoomRole;
  error?: string;
  hostName?: string;
};

type ParticipantsPayload = {
  participants?: RoomParticipant[];
};

type PendingRequestsPayload = {
  requests?: PendingParticipant[];
};

type UseWebRTCOptions = {
  intent?: RoomJoinIntent;
  joinAttempt?: number;
  enablePrejoinMedia?: boolean;
};

export type MediaDeviceOption = {
  deviceId: string;
  label: string;
};

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export const useWebRTC = (roomId: string | null, name: string, options: UseWebRTCOptions = {}) => {
  const { intent = "join", joinAttempt = 0, enablePrejoinMedia = false } = options;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamMap>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<RemoteStreamMap>({});
  const [peerNames, setPeerNames] = useState<PeerNameMap>({});
  const [peerScreenSharing, setPeerScreenSharing] = useState<PeerShareMap>({});
  const [currentSharerId, setCurrentSharerId] = useState<string | null>(null);
  const [mySocketId, setMySocketId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasMedia, setHasMedia] = useState(false);
  const [peerVideoEnabled, setPeerVideoEnabled] = useState<PeerVideoEnabledMap>({});
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceOption[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceOption[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = useState("");
  const [selectedVideoInputId, setSelectedVideoInputId] = useState("");
  const [roomEntryState, setRoomEntryState] = useState<RoomEntryState>("idle");
  const [roomEntryError, setRoomEntryError] = useState("");
  const [roomRole, setRoomRole] = useState<RoomRole | null>(null);
  const [hostName, setHostName] = useState("");
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [pendingParticipants, setPendingParticipants] = useState<PendingParticipant[]>([]);
  const [admittingParticipantId, setAdmittingParticipantId] = useState<string | null>(null);

  const isScreenSharingRef = useRef(false);
  const isVideoEnabledRef = useRef(true);
  const isMutedRef = useRef(false);
  const currentSharerIdRef = useRef<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioTracksRef = useRef<MediaStreamTrack[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingOwnStreamRef = useRef(false);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const stopScreenShareRef = useRef<() => void>(() => {});
  const peerScreenSharingRef = useRef<PeerShareMap>({});
  const expectingScreenFromRef = useRef<Record<string, boolean>>({});
  const screenSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  useEffect(() => {
    isVideoEnabledRef.current = isVideoEnabled;
  }, [isVideoEnabled]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    currentSharerIdRef.current = currentSharerId;
  }, [currentSharerId]);

  const buildLocalStream = useCallback((videoTrack: MediaStreamTrack | null) => {
    const stream = new MediaStream();
    audioTracksRef.current.forEach((track) => stream.addTrack(track));
    if (videoTrack) {
      stream.addTrack(videoTrack);
    }
    return stream;
  }, []);

  const refreshAvailableDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(
        (device) => device.kind === "audioinput" && Boolean(device.deviceId)
      );
      const videoInputs = devices.filter(
        (device) => device.kind === "videoinput" && Boolean(device.deviceId)
      );

      setAudioInputDevices(
        audioInputs.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }))
      );
      setVideoInputDevices(
        videoInputs.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }))
      );

      const activeAudioId = audioTracksRef.current[0]?.getSettings().deviceId ?? "";
      const activeVideoId = cameraTrackRef.current?.getSettings().deviceId ?? "";

      setSelectedAudioInputId((previous) => {
        if (previous && audioInputs.some((device) => device.deviceId === previous)) {
          return previous;
        }
        if (activeAudioId && audioInputs.some((device) => device.deviceId === activeAudioId)) {
          return activeAudioId;
        }
        return audioInputs[0]?.deviceId ?? "";
      });

      setSelectedVideoInputId((previous) => {
        if (previous && videoInputs.some((device) => device.deviceId === previous)) {
          return previous;
        }
        if (activeVideoId && videoInputs.some((device) => device.deviceId === activeVideoId)) {
          return activeVideoId;
        }
        return videoInputs[0]?.deviceId ?? "";
      });
    } catch {
      // Ignore enumeration failures (permissions / browser support).
    }
  }, []);

  const closePeerConnection = useCallback((peerId: string) => {
    const peer = peerConnectionsRef.current.get(peerId);
    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onconnectionstatechange = null;
      peer.close();
      peerConnectionsRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setRemoteScreenStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setPeerNames((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setPeerScreenSharing((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setPeerVideoEnabled((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    delete peerScreenSharingRef.current[peerId];
    delete expectingScreenFromRef.current[peerId];
    screenSendersRef.current.delete(peerId);
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string) => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) return existing;

      const peerConnection = new RTCPeerConnection(rtcConfig);
      peerConnectionsRef.current.set(peerId, peerConnection);

      const cameraStream = buildLocalStream(cameraTrackRef.current);
      cameraStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, cameraStream);
      });

      const socket = socketRef.current;
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("ice-candidate", { to: peerId, candidate: event.candidate });
        }
      };

      peerConnection.ontrack = (event) => {
        const incomingStream = event.streams[0] ?? new MediaStream([event.track]);
        const isVideoTrack = event.track.kind === "video";
        const streamHasAudio = incomingStream.getAudioTracks().length > 0;
        const peerIsSharing =
          currentSharerIdRef.current === peerId ||
          peerScreenSharingRef.current[peerId] === true;
        const shouldUseAsScreen =
          isVideoTrack &&
          !streamHasAudio &&
          (expectingScreenFromRef.current[peerId] || peerIsSharing);

        if (shouldUseAsScreen) {
          expectingScreenFromRef.current[peerId] = false;
          setRemoteScreenStreams((prev) => ({ ...prev, [peerId]: incomingStream }));
        } else {
          setRemoteStreams((prev) => ({ ...prev, [peerId]: incomingStream }));
        }
      };

      peerConnection.onconnectionstatechange = () => {
        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected" ||
          peerConnection.connectionState === "closed"
        ) {
          closePeerConnection(peerId);
        }
      };

      return peerConnection;
    },
    [buildLocalStream, closePeerConnection]
  );

  const shouldPrepareMedia = enablePrejoinMedia || Boolean(roomId && name.trim());

  useEffect(() => {
    if (!shouldPrepareMedia) return;
    let active = true;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        audioTracksRef.current = mediaStream.getAudioTracks();
        cameraTrackRef.current = mediaStream.getVideoTracks()[0] ?? null;
        audioTracksRef.current.forEach((track) => {
          track.enabled = !isMutedRef.current;
        });
        if (cameraTrackRef.current) {
          cameraTrackRef.current.contentHint = "motion";
          cameraTrackRef.current.enabled = isVideoEnabledRef.current;
        }
        const combinedStream = buildLocalStream(cameraTrackRef.current);
        localStreamRef.current = combinedStream;
        setLocalStream(combinedStream);
        setLocalCameraStream(combinedStream);
        setHasMedia(true);
        setSelectedAudioInputId(audioTracksRef.current[0]?.getSettings().deviceId ?? "");
        setSelectedVideoInputId(cameraTrackRef.current?.getSettings().deviceId ?? "");
        void refreshAvailableDevices();
      })
      .catch(() => {
        setLocalStream(null);
        setLocalCameraStream(null);
        setHasMedia(false);
        setRoomEntryState("error");
        setRoomEntryError(
          "Unable to access camera and microphone. Please allow media permissions and retry."
        );
        void refreshAvailableDevices();
      });

    return () => {
      active = false;
    };
  }, [buildLocalStream, refreshAvailableDevices, shouldPrepareMedia]);

  useEffect(() => {
    if (!shouldPrepareMedia || typeof navigator === "undefined" || !navigator.mediaDevices) {
      return;
    }

    const handleDeviceChange = () => {
      void refreshAvailableDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [refreshAvailableDevices, shouldPrepareMedia]);

  useEffect(() => {
    if (!roomId || !name.trim() || !hasMedia) return;
    const socket = getSocket();
    socketRef.current = socket;
    const peerConnections = peerConnectionsRef.current;

    const broadcastCurrentMediaState = () => {
      socket.emit("video-state", {
        roomId,
        videoEnabled: isVideoEnabledRef.current,
      });
      if (isScreenSharingRef.current) {
        socket.emit("screen-share", { roomId, isSharing: true });
      }
    };

    const applyJoinResponse = (response?: JoinRoomResponse) => {
      if (response?.hostName) {
        setHostName(response.hostName);
      }

      const status = response?.status;
      if (status === "joined") {
        setRoomEntryState("joined");
        setRoomEntryError("");
        setRoomRole(response?.role ?? null);
        broadcastCurrentMediaState();
        return;
      }

      if (status === "waiting") {
        setRoomEntryState("waiting");
        setRoomEntryError("");
        setRoomRole("participant");
        return;
      }

      if (
        status === "room-not-found" ||
        status === "name-taken" ||
        status === "invalid-room" ||
        status === "invalid-name"
      ) {
        setRoomEntryState(status);
        setRoomEntryError(response?.error ?? "Unable to join this room.");
        setRoomRole(null);
        return;
      }

      setRoomEntryState("error");
      setRoomEntryError(response?.error ?? "Unable to join this room right now.");
      setRoomRole(null);
    };

    const joinRoom = () => {
      setRoomEntryState("joining");
      setRoomEntryError("");
      socket.emit("join-room", { roomId, name, intent }, (response?: JoinRoomResponse) => {
        applyJoinResponse(response);
      });
    };

    const handleConnect = () => {
      setMySocketId(socket.id ?? null);
      joinRoom();
    };

    const handleDisconnect = () => {
      setMySocketId(null);
    };

    const handleRoomEntryApproved = ({
      role,
      hostName: serverHostName,
    }: {
      role?: RoomRole;
      hostName?: string;
    }) => {
      if (serverHostName) {
        setHostName(serverHostName);
      }
      setRoomRole(role ?? "participant");
      setRoomEntryState("joined");
      setRoomEntryError("");
      broadcastCurrentMediaState();
    };

    const handleRoomEntryWaiting = ({
      hostName: serverHostName,
    }: {
      hostName?: string;
    }) => {
      if (serverHostName) {
        setHostName(serverHostName);
      }
      setRoomRole("participant");
      setRoomEntryState("waiting");
      setRoomEntryError("");
    };

    const handleRoomEntryDenied = ({ reason }: { reason?: string }) => {
      setRoomEntryState("error");
      setRoomEntryError(reason ?? "Your join request was rejected.");
      setRoomRole(null);
    };

    const handleRoomEntryRevoked = ({ reason }: { reason?: string }) => {
      setRoomEntryState("revoked");
      setRoomEntryError(reason ?? "Your room session has ended.");
      setRoomRole(null);
    };

    const handleParticipantsUpdate = ({ participants: nextParticipants = [] }: ParticipantsPayload) => {
      setParticipants(nextParticipants);
    };

    const handlePendingRequests = ({ requests = [] }: PendingRequestsPayload) => {
      setPendingParticipants(requests);
    };

    const handleScreenSharer = ({ id }: { id: string | null }) => {
      setCurrentSharerId(id);
      currentSharerIdRef.current = id;
      if (id !== null) {
        peerScreenSharingRef.current = { [id]: true };
      } else {
        peerScreenSharingRef.current = {};
      }
      if (id !== null && id !== socket.id) {
        expectingScreenFromRef.current[id] = true;
        if (isScreenSharingRef.current) {
          stopScreenShareRef.current();
        }
      }
    };

    const handlePeers = (peers: Array<string | { id: string; name?: string; role?: RoomRole }>) => {
      const names: PeerNameMap = {};
      for (const peer of peers) {
        const id = typeof peer === "string" ? peer : peer.id;
        if (!id) continue;
        // New joiner only prepares peer connections; existing peers will offer.
        createPeerConnection(id);
        if (typeof peer !== "string") {
          names[id] = peer.name || "Guest";
        }
      }
      if (Object.keys(names).length) {
        setPeerNames((prev) => ({ ...prev, ...names }));
      }
    };

    const handlePeerJoined = async (
      payload: string | { id: string; name?: string; role?: RoomRole }
    ) => {
      const id = typeof payload === "string" ? payload : payload.id;
      const peerName = typeof payload === "string" ? "Guest" : payload.name || "Guest";
      if (!id) return;
      const peerConnection = createPeerConnection(id);
      if (peerConnection.signalingState !== "stable") {
        setPeerNames((prev) => ({ ...prev, [id]: peerName || "Guest" }));
        return;
      }
      if (isScreenSharingRef.current && screenStreamRef.current) {
        const screenTrack = screenStreamRef.current.getVideoTracks()[0];
        if (screenTrack) {
          const sender = peerConnection.addTrack(screenTrack, screenStreamRef.current);
          screenSendersRef.current.set(id, sender);
        }
      }
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("offer", { to: id, sdp: offer });
      } catch {
        // Avoid InvalidStateError if state changed (e.g. we received their offer first)
        return;
      }
      setPeerNames((prev) => ({
        ...prev,
        [id]: peerName || "Guest",
      }));
      broadcastCurrentMediaState();
    };

    const handleOffer = async ({
      from,
      sdp,
    }: {
      from: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const peerConnection = createPeerConnection(from);
      if (peerConnection.signalingState !== "stable") {
        return;
      }
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", { to: from, sdp: answer });
      if (
        peerConnection.signalingState === "stable" &&
        isScreenSharingRef.current &&
        screenStreamRef.current &&
        !screenSendersRef.current.has(from)
      ) {
        const screenTrack = screenStreamRef.current.getVideoTracks()[0];
        if (screenTrack) {
          try {
            const sender = peerConnection.addTrack(screenTrack, screenStreamRef.current);
            screenSendersRef.current.set(from, sender);
            const reoffer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(reoffer);
            socket.emit("offer", { to: from, sdp: reoffer });
          } catch {
            screenSendersRef.current.delete(from);
          }
        }
      }
    };

    const handleAnswer = async ({
      from,
      sdp,
    }: {
      from: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const peerConnection = peerConnectionsRef.current.get(from);
      if (!peerConnection) return;
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      if (
        peerConnection.signalingState === "stable" &&
        isScreenSharingRef.current &&
        screenStreamRef.current &&
        !screenSendersRef.current.has(from)
      ) {
        const screenTrack = screenStreamRef.current.getVideoTracks()[0];
        if (screenTrack) {
          try {
            const sender = peerConnection.addTrack(screenTrack, screenStreamRef.current);
            screenSendersRef.current.set(from, sender);
            const reoffer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(reoffer);
            socket.emit("offer", { to: from, sdp: reoffer });
          } catch {
            screenSendersRef.current.delete(from);
          }
        }
      }
    };

    const handleIceCandidate = async ({
      from,
      candidate,
    }: {
      from: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const peerConnection = peerConnectionsRef.current.get(from);
      if (!peerConnection || !candidate) return;
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore ICE candidates that fail to apply.
      }
    };

    const handlePeerLeft = (peerId: string) => {
      closePeerConnection(peerId);
    };

    const handleScreenShare = ({
      id,
      isSharing,
    }: {
      id: string;
      isSharing: boolean;
    }) => {
      if (!id) return;
      peerScreenSharingRef.current[id] = Boolean(isSharing);
      if (!isSharing) {
        delete peerScreenSharingRef.current[id];
      }
      setPeerScreenSharing((prev) => ({
        ...prev,
        [id]: Boolean(isSharing),
      }));
      if (isSharing) {
        expectingScreenFromRef.current[id] = true;
      } else {
        expectingScreenFromRef.current[id] = false;
        setRemoteScreenStreams((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    };

    const handlePeerVideoState = ({
      peerId,
      videoEnabled,
    }: {
      peerId: string;
      videoEnabled: boolean;
    }) => {
      setPeerVideoEnabled((prev) => ({ ...prev, [peerId]: videoEnabled }));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room-entry-approved", handleRoomEntryApproved);
    socket.on("room-entry-waiting", handleRoomEntryWaiting);
    socket.on("room-entry-denied", handleRoomEntryDenied);
    socket.on("room-entry-revoked", handleRoomEntryRevoked);
    socket.on("participants-update", handleParticipantsUpdate);
    socket.on("pending-requests", handlePendingRequests);
    socket.on("peers", handlePeers);
    socket.on("peer-joined", handlePeerJoined);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("peer-left", handlePeerLeft);
    socket.on("screen-share", handleScreenShare);
    socket.on("screen-sharer", handleScreenSharer);
    socket.on("peer-video-state", handlePeerVideoState);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.emit("leave-room", { roomId });
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room-entry-approved", handleRoomEntryApproved);
      socket.off("room-entry-waiting", handleRoomEntryWaiting);
      socket.off("room-entry-denied", handleRoomEntryDenied);
      socket.off("room-entry-revoked", handleRoomEntryRevoked);
      socket.off("participants-update", handleParticipantsUpdate);
      socket.off("pending-requests", handlePendingRequests);
      socket.off("peers", handlePeers);
      socket.off("peer-joined", handlePeerJoined);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("peer-left", handlePeerLeft);
      socket.off("screen-share", handleScreenShare);
      socket.off("screen-sharer", handleScreenSharer);
      socket.off("peer-video-state", handlePeerVideoState);
      const peerIds = Array.from(peerConnections.keys());
      peerIds.forEach((peerId) => closePeerConnection(peerId));
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
    };
  }, [closePeerConnection, createPeerConnection, hasMedia, intent, joinAttempt, name, roomId]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (cameraTrackRef.current) {
        cameraTrackRef.current.stop();
        cameraTrackRef.current = null;
      }
      audioTracksRef.current.forEach((track) => track.stop());
      audioTracksRef.current = [];
    };
  }, []);

  const switchAudioInput = useCallback(
    async (deviceId: string) => {
      if (!deviceId || deviceId === selectedAudioInputId) {
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
          video: false,
        });
        const nextAudioTrack = stream.getAudioTracks()[0] ?? null;
        if (!nextAudioTrack) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        nextAudioTrack.enabled = !isMuted;
        const previousAudioTracks = audioTracksRef.current;
        audioTracksRef.current = [nextAudioTrack];

        for (const [, peerConnection] of peerConnectionsRef.current) {
          const audioSender = peerConnection
            .getSenders()
            .find((sender) => sender.track?.kind === "audio");
          if (!audioSender) continue;
          try {
            await audioSender.replaceTrack(nextAudioTrack);
          } catch {
            // Ignore individual peer replace failures.
          }
        }

        previousAudioTracks.forEach((track) => track.stop());

        const nextCameraStream = buildLocalStream(cameraTrackRef.current);
        setLocalCameraStream(nextCameraStream);
        if (isScreenSharingRef.current) {
          const sharedTrack = screenStreamRef.current?.getVideoTracks()[0] ?? null;
          const nextLocalStream = buildLocalStream(sharedTrack);
          localStreamRef.current = nextLocalStream;
          setLocalStream(nextLocalStream);
        } else {
          localStreamRef.current = nextCameraStream;
          setLocalStream(nextCameraStream);
        }

        setSelectedAudioInputId(deviceId);
        void refreshAvailableDevices();
      } catch {
        // Ignore device switch failures.
      }
    },
    [buildLocalStream, isMuted, refreshAvailableDevices, selectedAudioInputId]
  );

  const switchVideoInput = useCallback(
    async (deviceId: string) => {
      if (!deviceId || deviceId === selectedVideoInputId) {
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: false,
        });
        const nextCameraTrack = stream.getVideoTracks()[0] ?? null;
        if (!nextCameraTrack) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        nextCameraTrack.contentHint = "motion";
        nextCameraTrack.enabled = isVideoEnabledRef.current;
        const previousCameraTrack = cameraTrackRef.current;
        cameraTrackRef.current = nextCameraTrack;

        for (const [peerId, peerConnection] of peerConnectionsRef.current) {
          const screenSender = screenSendersRef.current.get(peerId);
          const cameraSender = peerConnection
            .getSenders()
            .find((sender) => sender.track?.kind === "video" && sender !== screenSender);
          if (!cameraSender) continue;
          try {
            await cameraSender.replaceTrack(nextCameraTrack);
          } catch {
            // Ignore individual peer replace failures.
          }
        }

        if (previousCameraTrack) {
          previousCameraTrack.stop();
        }

        const nextCameraStream = buildLocalStream(nextCameraTrack);
        setLocalCameraStream(nextCameraStream);
        if (isScreenSharingRef.current) {
          const sharedTrack = screenStreamRef.current?.getVideoTracks()[0] ?? null;
          const nextLocalStream = buildLocalStream(sharedTrack);
          localStreamRef.current = nextLocalStream;
          setLocalStream(nextLocalStream);
        } else {
          localStreamRef.current = nextCameraStream;
          setLocalStream(nextCameraStream);
        }

        setSelectedVideoInputId(deviceId);
        void refreshAvailableDevices();
      } catch {
        // Ignore device switch failures.
      }
    },
    [buildLocalStream, refreshAvailableDevices, selectedVideoInputId]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((current) => {
      const nextMuted = !current;
      isMutedRef.current = nextMuted;
      audioTracksRef.current.forEach((track) => {
        track.enabled = !nextMuted;
      });
      return nextMuted;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    const next = !isVideoEnabled;
    if (cameraTrackRef.current) {
      cameraTrackRef.current.enabled = next;
    }
    isVideoEnabledRef.current = next;
    setIsVideoEnabled(next);
    if (roomId) {
      socketRef.current?.emit("video-state", { roomId, videoEnabled: next });
    }
  }, [isVideoEnabled, roomId]);

  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current) return;
    const socket = socketRef.current;
    const screenStream = screenStreamRef.current;
    screenStream.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    const toRemove = Array.from(screenSendersRef.current.entries());
    screenSendersRef.current.clear();
    for (const [peerId, sender] of toRemove) {
      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc || !sender.track) continue;
      if (!pc.getSenders().includes(sender)) continue;
      if (pc.signalingState !== "stable") continue;
      try {
        pc.removeTrack(sender);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit("offer", { to: peerId, sdp: offer });
      } catch {
        // ignore renegotiation errors
      }
    }
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);
    if (roomId) {
      socket?.emit("screen-share", { roomId, isSharing: false });
    }
    const stream = buildLocalStream(cameraTrackRef.current);
    localStreamRef.current = stream;
    setLocalStream(stream);
  }, [buildLocalStream, roomId]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = displayStream.getVideoTracks()[0] ?? null;
    if (!screenTrack) return;
    screenTrack.contentHint = "detail";

    screenTrack.onended = () => {
      stopScreenShare();
    };
    screenTrack.enabled = true;

    screenStreamRef.current = displayStream;
    isScreenSharingRef.current = true;
    setIsScreenSharing(true);
    if (roomId) {
      socketRef.current?.emit("screen-share", { roomId, isSharing: true });
    }
    const stream = buildLocalStream(screenTrack);
    localStreamRef.current = stream;
    setLocalStream(stream);

    await new Promise((r) => setTimeout(r, 80));
    const socket = socketRef.current;
    for (const [peerId, pc] of peerConnectionsRef.current) {
      if (pc.signalingState !== "stable") continue;
      const sender = pc.addTrack(screenTrack, displayStream);
      screenSendersRef.current.set(peerId, sender);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit("offer", { to: peerId, sdp: offer });
      } catch {
        screenSendersRef.current.delete(peerId);
      }
    }
  }, [buildLocalStream, isScreenSharing, roomId, stopScreenShare]);

  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    let recordingStream = screenStreamRef.current;
    recordingOwnStreamRef.current = false;

    if (!recordingStream) {
      recordingStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      recordingStreamRef.current = recordingStream;
      recordingOwnStreamRef.current = true;
    }

    const recorder = new MediaRecorder(recordingStream);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `screen-recording-${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
      if (recordingOwnStreamRef.current && recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
    };

    recorder.start(1000);
    setIsRecording(true);
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const admitParticipant = useCallback(
    async (participantId: string) => {
      if (!roomId || !participantId) {
        return { ok: false, error: "Invalid admission request." };
      }

      const socket = socketRef.current ?? getSocket();
      setAdmittingParticipantId(participantId);

      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        socket.emit(
          "admit-participant",
          { roomId, socketId: participantId },
          (response?: { ok?: boolean; error?: string }) => {
            setAdmittingParticipantId((current) =>
              current === participantId ? null : current
            );

            if (response?.ok) {
              resolve({ ok: true });
              return;
            }

            resolve({
              ok: false,
              error: response?.error ?? "Unable to admit participant right now.",
            });
          }
        );
      });
    },
    [roomId]
  );

  const isLocalSharer =
    currentSharerId === null
      ? isScreenSharing
      : mySocketId === null
        ? isScreenSharing
        : currentSharerId === mySocketId;

  return {
    roomEntryState,
    roomEntryError,
    roomRole,
    hostName,
    participants,
    pendingParticipants,
    admittingParticipantId,
    admitParticipant,
    localStream,
    localCameraStream,
    remoteStreams,
    remoteScreenStreams,
    peerNames,
    peerScreenSharing,
    peerVideoEnabled,
    audioInputDevices,
    videoInputDevices,
    selectedAudioInputId,
    selectedVideoInputId,
    currentSharerId,
    isLocalSharer,
    isMuted,
    toggleMute,
    switchAudioInput,
    isVideoEnabled,
    toggleVideo,
    switchVideoInput,
    isScreenSharing,
    toggleScreenShare,
    isRecording,
    startRecording,
    stopRecording,
  };
};

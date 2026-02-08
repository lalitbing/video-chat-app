"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/app/lib/socket";

type RemoteStreamMap = Record<string, MediaStream>;
type PeerNameMap = Record<string, string>;
type PeerShareMap = Record<string, boolean>;
type PeerVideoEnabledMap = Record<string, boolean>;

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export const useWebRTC = (roomId: string | null, name: string) => {
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

  const isScreenSharingRef = useRef(false);
  const isVideoEnabledRef = useRef(true);
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

  useEffect(() => {
    if (!roomId) return;
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
        if (cameraTrackRef.current) {
          cameraTrackRef.current.contentHint = "motion";
        }
        const combinedStream = buildLocalStream(cameraTrackRef.current);
        localStreamRef.current = combinedStream;
        setLocalStream(combinedStream);
        setLocalCameraStream(combinedStream);
        setHasMedia(true);
      })
      .catch(() => {
        setLocalStream(null);
        setHasMedia(false);
      });

    return () => {
      active = false;
    };
  }, [buildLocalStream, roomId]);

  useEffect(() => {
    if (!roomId || !hasMedia) return;
    const socket = getSocket();
    socketRef.current = socket;
    const peerConnections = peerConnectionsRef.current;

    const joinRoom = () => {
      socket.emit("join-room", { roomId, name });
      socket.emit("video-state", {
        roomId,
        videoEnabled: isVideoEnabledRef.current,
      });
      if (isScreenSharingRef.current) {
        socket.emit("screen-share", { roomId, isSharing: true });
      }
    };

    const handleConnect = () => {
      setMySocketId(socket.id ?? null);
      joinRoom();
    };

    const handleDisconnect = () => {
      setMySocketId(null);
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

    const handlePeers = (peers: Array<string | { id: string; name?: string }>) => {
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
        setPeerNames(names);
      }
    };

    const handlePeerJoined = async (
      payload: string | { id: string; name?: string }
    ) => {
      const id = typeof payload === "string" ? payload : payload.id;
      const name = typeof payload === "string" ? "Guest" : payload.name || "Guest";
      if (!id) return;
      const peerConnection = createPeerConnection(id);
      if (peerConnection.signalingState !== "stable") {
        setPeerNames((prev) => ({ ...prev, [id]: name || "Guest" }));
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
        [id]: name || "Guest",
      }));
      if (roomId && isScreenSharingRef.current) {
        socket.emit("screen-share", { roomId, isSharing: true });
      }
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

    const handleAnswer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
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
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
    };
  }, [closePeerConnection, createPeerConnection, hasMedia, name, roomId]);

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
    };
  }, []);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    audioTracksRef.current.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted]);

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

  const isLocalSharer =
    currentSharerId === null
      ? isScreenSharing
      : mySocketId === null
        ? isScreenSharing
        : currentSharerId === mySocketId;

  return {
    localStream,
    localCameraStream,
    remoteStreams,
    remoteScreenStreams,
    peerNames,
    peerScreenSharing,
    peerVideoEnabled,
    currentSharerId,
    isLocalSharer,
    isMuted,
    toggleMute,
    isVideoEnabled,
    toggleVideo,
    isScreenSharing,
    toggleScreenShare,
    isRecording,
    startRecording,
    stopRecording,
  };
};

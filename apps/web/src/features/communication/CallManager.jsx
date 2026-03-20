import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import { Mic, MicOff, Video, VideoOff, PhoneOff, User as UserIcon, GripHorizontal, GripVertical } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';

function CallManager({ workspaceId, onSetJoinCall, onCallStateChange }) {
    const { user } = useAuthStore();
    const [inCall, setInCall] = useState(false);
    const [hasAudio, setHasAudio] = useState(true);
    const [hasVideo, setHasVideo] = useState(true);
    const [peers, setPeers] = useState([]);

    // Draggable dialog state
    const [position, setPosition] = useState({ x: 80, y: 80 });
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Resizable dialog state
    const [size, setSize] = useState({ width: 360, height: 300 });
    const resizing = useRef(false);
    const resizeStart = useRef({ x: 200, y: 0, width: 0, height: 0 });

    const userVideo = useRef();
    const peersRef = useRef([]);
    const streamRef = useRef();
    const socketRef = useRef();

    // Make sure the local video element gets the stream
    useEffect(() => {
        if (inCall && userVideo.current && streamRef.current) {
            userVideo.current.srcObject = streamRef.current;
        }
    }, [inCall, hasVideo]);

    useEffect(() => {
        const socket = getSocket();
        socketRef.current = socket;

        if (!socket) return;

        const handleUserJoined = (payload) => {
            console.log(`[WebRTC] User ${payload.callerId} joined! I am initiating connection.`);
            if (!streamRef.current) return;

            if (peersRef.current.find(p => p.peerId === payload.callerId)) return;

            const peer = createPeer(payload.callerId, socket.id, streamRef.current);
            const peerObj = { peerId: payload.callerId, peer };

            peersRef.current.push(peerObj);
            setPeers([...peersRef.current]);
        };

        const handleSignal = (payload) => {
            const callerSessionId = payload.callerId;
            const item = peersRef.current.find((p) => p.peerId === callerSessionId);

            if (item) {
                console.log(`[WebRTC] Passing signal ${payload.signal.type || 'candidate'} to existing peer ${callerSessionId}`);
                item.peer.signal(payload.signal);
            } else {
                console.log(`[WebRTC] Received incoming offer from ${callerSessionId}`);
                if (!streamRef.current) return;

                if (peersRef.current.find(p => p.peerId === callerSessionId)) return;

                const peer = addPeer(payload.signal, callerSessionId, streamRef.current);
                const peerObj = { peerId: callerSessionId, peer };

                peersRef.current = [...peersRef.current, peerObj];
                setPeers([...peersRef.current]);
            }
        };

        const handleUserLeft = (id) => {
            console.log("[WebRTC] user left", id);
            const peerObj = peersRef.current.find(p => p.peerId === id);
            if (peerObj) {
                peerObj.peer.destroy();
            }
            peersRef.current = peersRef.current.filter(p => p.peerId !== id);
            setPeers([...peersRef.current]);
        };

        const handleReconnect = () => {
            console.log("[WebRTC] Socket reconnected, re-joining call room");
            if (inCall) {
                socket.emit('webrtc:join-call', { workspaceId, userId: user.id });
            }
        };

        if (inCall) {
            socket.on('connect', handleReconnect);
            socket.on('webrtc:user-joined', handleUserJoined);
            socket.on('webrtc:signal', handleSignal);
            socket.on('webrtc:user-left', handleUserLeft);
            
            socket.on('webrtc:active-users', (usersInCall) => {
                console.log("[WebRTC] Active users received from server", usersInCall);
                usersInCall.forEach(callerId => {
                    if (callerId === socket.id) return;
                    if (!streamRef.current) return;
                    if (peersRef.current.find(p => p.peerId === callerId)) return;
                    
                    const peer = createPeer(callerId, socket.id, streamRef.current);
                    const peerObj = { peerId: callerId, peer };

                    peersRef.current = [...peersRef.current, peerObj];
                    setPeers([...peersRef.current]);
                });
            });

            socket.emit('webrtc:join-call', { workspaceId, userId: user.id });
        }

        return () => {
            socket.off('connect', handleReconnect);
            socket.off('webrtc:user-joined', handleUserJoined);
            socket.off('webrtc:signal', handleSignal);
            socket.off('webrtc:user-left', handleUserLeft);
            socket.off('webrtc:active-users');
        };
    }, [inCall, workspaceId, user.id]);

    const stopMediaStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }
    };

    const joinCall = useCallback(() => {
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then((stream) => {
                streamRef.current = stream;
                setInCall(true);
                onCallStateChange?.(true);
            })
            .catch((err) => {
                console.error("Failed to get local stream", err);
                alert("Could not access camera/microphone");
            });
    }, [onCallStateChange]);

    // Expose joinCall to parent via callback
    useEffect(() => {
        onSetJoinCall?.(joinCall);
    }, [joinCall, onSetJoinCall]);

    const leaveCall = () => {
        setInCall(false);
        onCallStateChange?.(false);
        socketRef.current.emit('webrtc:leave-call', { workspaceId });

        peersRef.current.forEach((peerObj) => {
            peerObj.peer.destroy();
        });
        peersRef.current = [];
        setPeers([]);

        stopMediaStream();
    };

    const ICE_CONFIG = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    };

    const createPeer = (userToSignal, callerId, stream) => {
        console.log(`[WebRTC] Creating peer for ${userToSignal} as initiator`);
        const peer = new Peer({
            initiator: true,
            trickle: true,
            config: ICE_CONFIG,
            stream,
        });

        peer.on('signal', (signal) => {
            console.log(`[WebRTC] Emitting signal ${signal.type || 'candidate'} to ${userToSignal}`);
            // Don't send signal if peer is destroyed
            if (!peer.destroyed) {
                socketRef.current.emit('webrtc:signal', {
                    userToSignal,
                    callerId,
                    signal,
                    workspaceId
                });
            }
        });

        peer.on('error', (err) => {
            console.error(`[WebRTC] Peer Error (initiator) with ${userToSignal}:`, err);
        });

        return peer;
    };

    const addPeer = (incomingSignal, callerId, stream) => {
        console.log(`[WebRTC] Adding peer from ${callerId}`);
        const peer = new Peer({
            initiator: false,
            trickle: true,
            config: ICE_CONFIG,
            stream,
        });

        peer.on('signal', (signal) => {
            console.log(`[WebRTC] Returning signal ${signal.type || 'candidate'} to ${callerId}`);
            // Don't send signal if peer is destroyed
            if (!peer.destroyed) {
                socketRef.current.emit('webrtc:signal', {
                    userToSignal: callerId,
                    callerId: socketRef.current.id,
                    signal,
                    workspaceId
                });
            }
        });

        peer.on('error', (err) => {
            console.error(`[WebRTC] Peer Error (receiver) with ${callerId}:`, err);
        });

        peer.signal(incomingSignal);

        return peer;
    };

    const toggleMute = () => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setHasAudio(audioTrack.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setHasVideo(videoTrack.enabled);
            }
        }
    };

    // Drag handlers
    const handleDragStart = (e) => {
        dragging.current = true;
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        };

        const handleMouseMove = (e) => {
            if (!dragging.current) return;
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y,
            });
        };

        const handleMouseUp = () => {
            dragging.current = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // Resize handler (bottom-right corner)
    const handleResizeStart = (e) => {
        e.stopPropagation();
        resizing.current = true;
        resizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height,
        };

        const handleMouseMove = (e) => {
            if (!resizing.current) return;
            const newWidth = Math.max(320, resizeStart.current.width + (e.clientX - resizeStart.current.x));
            const newHeight = Math.max(240, resizeStart.current.height + (e.clientY - resizeStart.current.y));
            setSize({ width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => {
            resizing.current = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // Sub-component to render individual peer video
    const VideoPeer = ({ peer }) => {
        const ref = useRef();
        useEffect(() => {
            // Set stream immediately if available
            if (peer.streams && peer.streams[0] && ref.current) {
                ref.current.srcObject = peer.streams[0];
            }

            const handleStream = (stream) => {
                console.log("[WebRTC] Received remote stream!", stream);
                if (ref.current) {
                    ref.current.srcObject = stream;
                }
            };
            
            const handleTrack = (track, stream) => {
                console.log("[WebRTC] Received remote track!", track.kind);
                if (ref.current) {
                    ref.current.srcObject = stream;
                }
            };

            peer.on('stream', handleStream);
            peer.on('track', handleTrack);
            
            return () => {
                peer.off('stream', handleStream);
                peer.off('track', handleTrack);
            }
        }, [peer]);

        return (
            <video
                playsInline
                autoPlay
                ref={ref}
                className="w-full h-full bg-black rounded-lg object-cover border-2 border-editor-border shadow-md"
            />
        );
    };

    if (!inCall) return null;

    return (
        /* Draggable + Resizable Active Call Dialog */
        <div
            className="fixed z-50 flex flex-col bg-editor-bg border border-editor-border rounded-xl shadow-2xl overflow-hidden"
            style={{
                left: position.x,
                top: position.y,
                width: size.width,
                height: size.height,
                minWidth: 320,
                minHeight: 240,
            }}
        >
            {/* Drag Handle */}
            <div
                onMouseDown={handleDragStart}
                className="flex items-center justify-between px-4 py-2 border-b border-editor-border cursor-grab active:cursor-grabbing select-none rounded-t-xl bg-editor-sidebar"
            >
                <span className="text-xs font-semibold text-editor-text-dim uppercase tracking-widest">Voice / Video</span>
                <GripHorizontal className="w-4 h-4 text-editor-text-dim" />
            </div>

            {/* Video Grid — fills available space */}
            <div className="flex-1 grid grid-cols-2 gap-3 p-3 overflow-y-auto">
                {/* Local Video */}
                <div className="relative aspect-video">
                    <video
                        playsInline
                        muted
                        ref={userVideo}
                        autoPlay
                        className={`w-full h-full bg-black rounded-lg object-cover border-2 border-editor-accent shadow-md ${!hasVideo ? 'hidden' : ''}`}
                    />
                    {!hasVideo && (
                        <div className="w-full h-full bg-editor-sidebar rounded-lg border-2 border-editor-accent flex justify-center items-center shadow-md aspect-video">
                            <UserIcon className="w-10 h-10 text-editor-text-dim" />
                        </div>
                    )}
                    <div className="absolute bottom-1.5 left-2 text-[10px] font-bold bg-black/60 px-1.5 py-0.5 rounded text-white shadow">
                        You
                    </div>
                </div>

                {/* Remote Videos */}
                {peers.map((peerObj) => (
                    <div key={peerObj.peerId} className="relative aspect-video">
                        <VideoPeer peer={peerObj.peer} />
                    </div>
                ))}
            </div>

            {/* Controls + Resize Handle */}
            <div className="relative flex items-center justify-center gap-3 px-4 py-3 border-t border-editor-border flex-shrink-0">
                <button
                    onClick={toggleMute}
                    className={`p-2.5 rounded-full text-white transition-colors ${hasAudio ? 'bg-editor-active hover:bg-editor-border' : 'bg-red-500 hover:bg-red-600'}`}
                    title={hasAudio ? "Mute Microphone" : "Unmute Microphone"}
                >
                    {hasAudio ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>

                <button
                    onClick={toggleVideo}
                    className={`p-2.5 rounded-full text-white transition-colors ${hasVideo ? 'bg-editor-active hover:bg-editor-border' : 'bg-red-500 hover:bg-red-600'}`}
                    title={hasVideo ? "Turn Off Camera" : "Turn On Camera"}
                >
                    {hasVideo ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>

                <button
                    onClick={leaveCall}
                    className="p-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 ml-2"
                    title="Leave Call"
                >
                    <PhoneOff className="w-4 h-4" />
                </button>

                {/* Resize handle — bottom-right corner */}
                <div
                    onMouseDown={handleResizeStart}
                    className="absolute bottom-1 right-1 w-5 h-5 flex items-end justify-end cursor-se-resize text-editor-text-dim hover:text-editor-text select-none"
                    title="Drag to resize"
                >
                    <GripVertical className="w-3.5 h-3.5 rotate-45" />
                </div>
            </div>
        </div>
    );
}

export default CallManager;

import { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';

function CallManager({ workspaceId }) {
    const { user } = useAuthStore();
    const [inCall, setInCall] = useState(false);
    const [hasAudio, setHasAudio] = useState(true);
    const [hasVideo, setHasVideo] = useState(true);
    const [peers, setPeers] = useState([]);

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

            // Deduplicate safely
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

                // Final safeguard against duplication
                if (peersRef.current.find(p => p.peerId === callerSessionId)) return;

                const peer = addPeer(payload.signal, callerSessionId, streamRef.current);
                const peerObj = { peerId: callerSessionId, peer };

                peersRef.current.push(peerObj);
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

            // Wait slightly for the event listeners to attach before emitting join-call
            socket.emit('webrtc:join-call', { workspaceId, userId: user.id });
        }

        return () => {
            socket.off('connect', handleReconnect);
            socket.off('webrtc:user-joined', handleUserJoined);
            socket.off('webrtc:signal', handleSignal);
            socket.off('webrtc:user-left', handleUserLeft);
        };
    }, [inCall, workspaceId, user.id]);

    const stopMediaStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }
    };

    const joinCall = () => {
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then((stream) => {
                setInCall(true);
                streamRef.current = stream;
                setInCall(true);
            })
            .catch((err) => {
                console.error("Failed to get local stream", err);
                alert("Could not access camera/microphone");
            });
    };

    const leaveCall = () => {
        setInCall(false);
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
            socketRef.current.emit('webrtc:signal', {
                userToSignal,
                callerId,
                signal,
                workspaceId
            });
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
            socketRef.current.emit('webrtc:signal', {
                userToSignal: callerId,
                callerId: socketRef.current.id,
                signal,
                workspaceId
            });
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

    // Sub-component to render individual peer video
    const VideoPeer = ({ peer }) => {
        const ref = useRef();
        useEffect(() => {
            if (peer.streams && peer.streams[0] && ref.current) {
                ref.current.srcObject = peer.streams[0];
            }

            peer.on('stream', (stream) => {
                console.log("[WebRTC] Received remote stream!", stream);
                if (ref.current) {
                    ref.current.srcObject = stream;
                }
            });
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

    return (
        <>
            {/* Join Call Button (Fixed Bottom Left) */}
            {!inCall && (
                <div className="absolute bottom-4 left-64 z-50">
                    <button
                        onClick={joinCall}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium rounded-full shadow-lg transition-colors"
                    >
                        <Phone className="w-4 h-4" />
                        Join Voice/Video
                    </button>
                </div>
            )}

            {/* Active Call Floating UI */}
            {inCall && (
                <div className="absolute bottom-4 left-64 z-50 flex flex-col items-stretch bg-editor-bg border border-editor-border p-4 rounded-xl shadow-2xl w-[800px] max-w-[calc(100vw-300px)]">

                    {/* Video Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-3 p-1 max-h-[60vh] overflow-y-auto">
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
                                <div className="w-full h-full bg-editor-sidebar rounded-lg border-2 border-editor-accent flex justify-center items-center shadow-md">
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

                    {/* Controls */}
                    <div className="flex items-center self-center gap-3">
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
                    </div>
                </div>
            )}
        </>
    );
}

export default CallManager;

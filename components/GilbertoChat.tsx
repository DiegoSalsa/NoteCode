"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { Bot, Loader2, Mic, MicOff, Play, Send, Volume2, VolumeX } from "lucide-react";

const DEEPGRAM_VOICES = [
    { id: "aura-2-estrella-es", label: "Estrella - natural MX" },
    { id: "aura-2-selena-es", label: "Selena - latina casual" },
    { id: "aura-2-celeste-es", label: "Celeste - latina energica" },
    { id: "aura-2-gloria-es", label: "Gloria - latina suave" },
    { id: "aura-2-olivia-es", label: "Olivia - calida MX" },
    { id: "aura-2-antonia-es", label: "Antonia - natural AR" },
    { id: "aura-2-javier-es", label: "Javier - masculino MX" },
    { id: "aura-2-sirio-es", label: "Sirio - masculino calmo" },
    { id: "aura-2-nestor-es", label: "Nestor - ejecutivo ES" },
    { id: "aura-2-alvaro-es", label: "Alvaro - masculino claro" },
    { id: "aura-2-valerio-es", label: "Valerio - grave natural" },
];

const CHAT_SESSION_KEY = "gilberto.sessionMessages";
const VOICE_ENABLED_KEY = "gilberto.voiceEnabled";

function getMessageText(message: UIMessage) {
    return message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
}

function renderInlineMarkdown(text: string) {
    const pieces = text.split(/(\*\*[^*]+\*\*)/g);

    return pieces.map((piece, index) => {
        if (piece.startsWith("**") && piece.endsWith("**")) {
            return (
                <strong key={index} className="font-semibold text-neutral-50">
                    {piece.slice(2, -2)}
                </strong>
            );
        }

        return <span key={index}>{piece}</span>;
    });
}

function MessageText({ text }: { text: string }) {
    const normalized = text
        .replace(/\r\n/g, "\n")
        .replace(/([.!?])([A-ZÁÉÍÓÚÑ])/g, "$1\n\n$2")
        .replace(/(\*\*[^*]+:\*\*)/g, "\n$1 ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return (
        <div className="space-y-2">
            {normalized.split("\n").map((line, index) => {
                const cleanLine = line.trim();
                if (!cleanLine) return <div key={index} className="h-1" />;

                const bullet = cleanLine.match(/^[-*]\s+(.+)/);
                if (bullet) {
                    return (
                        <div key={index} className="flex gap-2">
                            <span className="mt-[0.65em] h-1 w-1 shrink-0 rounded-full bg-neutral-500" />
                            <p>{renderInlineMarkdown(bullet[1])}</p>
                        </div>
                    );
                }

                return <p key={index}>{renderInlineMarkdown(cleanLine)}</p>;
            })}
        </div>
    );
}

function speechText(text: string) {
    return text
        .replace(/\*\*/g, "")
        .replace(/[-*]\s+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getSupportedMimeType() {
    if (typeof MediaRecorder === "undefined") return "";

    const options = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/ogg",
    ];

    return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function readSessionMessages() {
    if (typeof window === "undefined") return [];

    try {
        const raw = window.sessionStorage.getItem(CHAT_SESSION_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function readVoiceEnabled() {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(VOICE_ENABLED_KEY) === "true";
}

export default function GilbertoChat({ className = "" }: { className?: string }) {
    const [input, setInput] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [initialMessages] = useState<UIMessage[]>(() => readSessionMessages() as UIMessage[]);
    const [voiceEnabled, setVoiceEnabled] = useState(() => readVoiceEnabled());
    const [selectedVoice, setSelectedVoice] = useState(DEEPGRAM_VOICES[0].id);
    const [voiceStatus, setVoiceStatus] = useState("");
    const [voiceError, setVoiceError] = useState("");

    const lastSpokenMessageId = useRef<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: "/api/gilberto",
            }),
        [],
    );

    const { messages, sendMessage, status, stop, error } = useChat({
        transport,
        messages: initialMessages,
    });

    const isBusy = status === "submitted" || status === "streaming";
    const canRecord = typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, status]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setSelectedVoice(window.localStorage.getItem("gilberto.deepgramVoice") || DEEPGRAM_VOICES[0].id);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.sessionStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        if (typeof window === "undefined" || !selectedVoice) return;
        window.localStorage.setItem("gilberto.deepgramVoice", selectedVoice);
    }, [selectedVoice]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(VOICE_ENABLED_KEY, String(voiceEnabled));
        if (!voiceEnabled) {
            audioPlayerRef.current?.pause();
            setVoiceStatus("");
        }
    }, [voiceEnabled]);

    useEffect(() => {
        if (!voiceEnabled || typeof window === "undefined") return;

        const lastMessage = messages.at(-1);
        if (!lastMessage || lastMessage.role !== "assistant" || lastMessage.id === lastSpokenMessageId.current) return;
        if (status !== "ready") return;

        const text = speechText(getMessageText(lastMessage));
        if (!text) return;

        lastSpokenMessageId.current = lastMessage.id;
        void playDeepgramVoice(text);
    }, [messages, selectedVoice, status, voiceEnabled]);

    useEffect(() => {
        return () => {
            mediaRecorderRef.current?.stop();
            mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
            audioPlayerRef.current?.pause();
        };
    }, []);

    async function playDeepgramVoice(text: string) {
        if (!voiceEnabled) return;

        try {
            setVoiceError("");
            audioPlayerRef.current?.pause();

            const response = await fetch("/api/gilberto/speak", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voice: selectedVoice }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || "No pude generar la voz.");
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audioPlayerRef.current = audio;
            audio.onended = () => URL.revokeObjectURL(audioUrl);
            await audio.play();
        } catch (err) {
            setVoiceError(err instanceof Error ? err.message : "No pude reproducir la voz.");
        }
    }

    async function sendVoiceText(text: string) {
        const cleanText = text.trim();
        if (!cleanText || isBusy) return;

        setInput("");
        await sendMessage({ text: cleanText });
    }

    async function transcribeAudio(blob: Blob) {
        setVoiceStatus("Transcribiendo con Deepgram...");
        setVoiceError("");

        const response = await fetch("/api/gilberto/transcribe", {
            method: "POST",
            headers: {
                "Content-Type": blob.type || "audio/webm",
            },
            body: blob,
        });

        const data = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;

        if (!response.ok || !data?.text) {
            throw new Error(data?.error || "No pude transcribir el audio.");
        }

        setInput(data.text);
        await sendVoiceText(data.text);
    }

    async function startRecording() {
        if (!canRecord || isRecording || isBusy) return;

        try {
            setVoiceError("");
            setVoiceStatus("Pidiendo permiso al microfono...");

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const mimeType = getSupportedMimeType();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

            audioChunksRef.current = [];
            mediaStreamRef.current = stream;
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            recorder.onerror = () => {
                setVoiceError("El grabador de audio fallo. Prueba cerrar otras apps que usen el microfono.");
                setVoiceStatus("");
                setIsRecording(false);
                stream.getTracks().forEach((track) => track.stop());
            };

            recorder.onstop = () => {
                setIsRecording(false);
                stream.getTracks().forEach((track) => track.stop());
                const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });

                if (audioBlob.size < 1000) {
                    setVoiceStatus("");
                    setVoiceError("El audio fue demasiado corto. Mantene presionado o habla un poco mas.");
                    return;
                }

                void transcribeAudio(audioBlob)
                    .catch((err) => setVoiceError(err instanceof Error ? err.message : "No pude transcribir el audio."))
                    .finally(() => setVoiceStatus(""));
            };

            recorder.start();
            setIsRecording(true);
            setVoiceStatus("Grabando. Toca el microfono otra vez para enviar.");
        } catch {
            setVoiceStatus("");
            setVoiceError("No pude acceder al microfono. Revisa permisos del navegador o del sistema.");
        }
    }

    function stopRecording() {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;

        setVoiceStatus("Procesando audio...");
        recorder.stop();
    }

    function testVoice() {
        if (!voiceEnabled) return;
        void playDeepgramVoice("Hola, soy Gilberto. Ahora uso una voz de Deepgram en espanol y puedo escucharte desde el celular.");
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const text = input.trim();
        if (!text || isBusy) return;

        setInput("");
        await sendMessage({ text });
    }

    return (
        <section className={`mx-auto flex h-[min(720px,calc(100vh-2rem))] w-full max-w-3xl flex-col rounded-lg border border-white/10 bg-neutral-950 shadow-2xl ${className}`}>
            <header className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-neutral-900">
                        <Bot size={17} className="text-neutral-200" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="truncate text-[15px] font-semibold text-neutral-100">Gilberto</h2>
                        <p className="truncate text-[12px] text-neutral-500">Voz Deepgram, proyectos, finanzas CLP y notas</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <select
                        value={selectedVoice}
                        onChange={(event) => setSelectedVoice(event.target.value)}
                        disabled={!voiceEnabled}
                        className="max-w-56 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-[12px] text-neutral-300 outline-none transition-colors hover:bg-white/5 focus:border-white/20 disabled:opacity-50"
                        title="Voz Deepgram de Gilberto"
                    >
                        {DEEPGRAM_VOICES.map((voice) => (
                            <option key={voice.id} value={voice.id}>
                                {voice.label}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={testVoice}
                        disabled={!voiceEnabled}
                        className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100 disabled:opacity-40"
                        title="Probar voz"
                    >
                        <Play size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setVoiceEnabled((current) => !current)}
                        className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100"
                        title={voiceEnabled ? "Apagar voz" : "Encender voz"}
                    >
                        {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>
                </div>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
                {messages.length === 0 && (
                    <div className="rounded-lg border border-white/10 bg-neutral-900 px-4 py-3 text-[13px] text-neutral-400">
                        Preguntame por proyectos activos, montos facturados, pendientes o estado financiero general.
                    </div>
                )}

                {messages.map((message) => {
                    const isUser = message.role === "user";
                    const text = getMessageText(message);

                    return (
                        <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                            <div
                                className={`max-w-[85%] rounded-lg border px-4 py-3 text-[14px] leading-6 ${
                                    isUser
                                        ? "border-white/10 bg-neutral-100 text-neutral-950"
                                        : "border-white/10 bg-neutral-900 text-neutral-200"
                                }`}
                            >
                                {text ? <MessageText text={text} /> : message.role === "assistant" ? "Consultando datos..." : ""}
                            </div>
                        </div>
                    );
                })}

                {isBusy && (
                    <div className="flex items-center gap-2 text-[13px] text-neutral-500">
                        <Loader2 size={14} className="animate-spin" />
                        Gilberto esta pensando
                    </div>
                )}

                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
                        {error.message || "No se pudo completar la respuesta."}
                    </div>
                )}

                {voiceError && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100">
                        {voiceError}
                    </div>
                )}

                {voiceStatus && (
                    <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-[13px] text-sky-100">
                        {voiceStatus}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="border-t border-white/10 p-3">
                <div className="flex items-end gap-2 rounded-lg border border-white/10 bg-neutral-900 p-2">
                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                event.currentTarget.form?.requestSubmit();
                            }
                        }}
                        rows={1}
                        placeholder="Escribele a Gilberto..."
                        className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600"
                    />
                    <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={!canRecord || isBusy}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            isRecording
                                ? "bg-red-500/15 text-red-200 hover:bg-red-500/20"
                                : "text-neutral-300 hover:bg-white/5"
                        }`}
                        title={isRecording ? "Detener y enviar voz" : canRecord ? "Hablar con Gilberto" : "Grabacion no disponible en este navegador"}
                    >
                        {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                    <button
                        type={isBusy ? "button" : "submit"}
                        onClick={isBusy ? stop : undefined}
                        disabled={!isBusy && !input.trim()}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                        title={isBusy ? "Detener respuesta" : "Enviar"}
                    >
                        {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
            </form>
        </section>
    );
}

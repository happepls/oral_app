const sdk = require("microsoft-cognitiveservices-speech-sdk");

class AzureAiService {
    constructor(ws) {
        this.ws = ws;
        this.pushStream = null;
        this.recognizer = null;
        this.speechConfig = null;
    }

    initialize() {
        const subscriptionKey = process.env.AZURE_SPEECH_API_KEY;
        const serviceRegion = process.env.AZURE_SPEECH_REGION;

        if (!subscriptionKey || !serviceRegion) {
            throw new Error("Azure Speech API key and region must be set in environment variables.");
        }

        this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
        this.speechConfig.speechRecognitionLanguage = "en-US";
        this.speechConfig.speechSynthesisVoiceName = "en-US-AvaMultilingualNeural";

        const audioFormat = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
        this.pushStream = sdk.AudioInputStream.createPushStream(audioFormat);
        const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);

        this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
        this.setupRecognizerEvents();
    }

    setupRecognizerEvents() {
        const sendJson = (data) => {
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify(data));
            }
        };

        this.recognizer.recognizing = (s, e) => {
            console.log(`RECOGNIZING: Text=${e.result.text}`);
            if (e.result.text) {
                sendJson({ type: 'asr_result', text: e.result.text, isFinal: false });
            }
        };

        this.recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                const recognizedText = e.result.text;
                console.log(`RECOGNIZED: Text=${recognizedText}`);
                if (recognizedText) {
                    sendJson({ type: 'asr_result', text: recognizedText, isFinal: true });
                    // Now, synthesize this text back to speech.
                    this.synthesizeText(recognizedText);
                }
            } else if (e.result.reason === sdk.ResultReason.NoMatch) {
                console.log("NOMATCH: Speech could not be recognized.");
                sendJson({ type: 'asr_nomatch' });
            }
        };

        this.recognizer.canceled = (s, e) => {
            console.log(`CANCELED: Reason=${e.reason}`);
            if (e.reason === sdk.CancellationReason.Error) {
                console.error(`CANCELED: ErrorCode=${e.errorCode}, ErrorDetails=${e.errorDetails}`);
            }
            sendJson({ type: 'asr_canceled', reason: e.reason });
        };

        this.recognizer.sessionStopped = (s, e) => {
            console.log("Session stopped event.");
            sendJson({ type: 'asr_session_stopped' });
        };
    }

    synthesizeText(text) {
        // For TTS, we don't stream the output to a file or speaker, but directly to a buffer.
        const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, null);

        synthesizer.speakTextAsync(
            text,
            (result) => {
                if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                    console.log(`SYNTHESIS COMPLETED: Audio duration ${result.audioDuration}, data size ${result.audioData.byteLength}`);
                    // result.audioData is an ArrayBuffer. Send it to the client.
                    if (this.ws.readyState === this.ws.OPEN) {
                        this.ws.send(Buffer.from(result.audioData), { binary: true });
                    }
                } else {
                    console.error("Speech synthesis canceled or failed, reason: " + result.reason);
                }
                synthesizer.close();
            },
            (err) => {
                console.error("Speech synthesis error:", err);
                synthesizer.close();
            }
        );
    }

    start() {
        this.recognizer.startContinuousRecognitionAsync(
            () => console.log("Recognition started."),
            (err) => console.error(`Error starting recognition: ${err}`)
        );
    }

    stop() {
        this.recognizer.stopContinuousRecognitionAsync(
            () => console.log("Recognition stopped."),
            (err) => console.error(`Error stopping recognition: ${err}`)
        );
    }

    handleAudio(audioData) {
        if (this.pushStream) {
            this.pushStream.write(audioData);
        }
    }
}

module.exports = AzureAiService;


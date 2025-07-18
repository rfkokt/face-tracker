"use client";

import { loadFaceApiModels } from "@/lib/loadFaceApiModels";
import * as faceapi from "face-api.js";
import { useEffect, useRef, useState } from "react";

export default function NeobrutalistFaceTracker() {
  const [faceDetected, setFaceDetected] = useState(false);
  const [tabActive, setTabActive] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState("");
  const [cameraPermission, setCameraPermission] = useState<string>("prompt");
  const [tabInactiveCount, setTabInactiveCount] = useState(0);
  const [userAgent, setUserAgent] = useState<string | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const multiFaceTimer = useRef<NodeJS.Timeout | null>(null);
  const [multiFaceCounter, setMultiFaceCounter] = useState(0);
  const [isLookingAtScreen, setIsLookingAtScreen] = useState<boolean | null>(
    null
  );
  const [expressionDetected, setExpressionDetected] = useState<string | null>(
    null
  );
  const [isRealFace, setIsRealFace] = useState<boolean>(true);

  const faceNotDetectedTimer = useRef<NodeJS.Timeout | null>(null);
  const [failureReason, setFailureReason] = useState<null | string>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionInterval = useRef<NodeJS.Timeout | null>(null);

  // Handle tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setTabActive(!document.hidden);
    };

    const handleBlur = () => setTabActive(false);
    const handleFocus = () => setTabActive(true);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Check camera permission
  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "camera" as PermissionName })
        .then((result) => {
          setCameraPermission(result.state);
          result.onchange = () => {
            setCameraPermission(result.state);
          };
        })
        .catch(() => {
          setCameraPermission("unknown");
        });
    }
  }, []);

  useEffect(() => {
    loadFaceApiModels();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabActive(false);
        setTabInactiveCount((prev) => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setFailureReason("Tab tidak aktif terlalu sering!");
          }
          return newCount;
        });
      } else {
        setTabActive(true);
      }
    };

    const handleBlur = () => handleVisibilityChange();
    const handleFocus = () => setTabActive(true);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setUserAgent(navigator.userAgent.split(" ")[0]);
    }
  }, []);

  // Start camera with better error handling
  const startCamera = async () => {
    try {
      setError("");
      setCameraReady(false);
      console.log("Requesting camera access...");

      // Check support
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not supported in this browser");
      }

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user", // or "environment" for rear camera
        },
        audio: false,
      };

      console.log("Getting user media with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Camera stream obtained");

      const videoEl = videoRef.current;
      if (!videoEl) {
        throw new Error("Video element not available");
      }

      // Set stream
      videoEl.srcObject = stream;

      // Autoplay policy fix: wait for metadata before play
      videoEl.onloadedmetadata = async () => {
        try {
          await videoEl.play();
          console.log("Video playback started");
          setCameraReady(true);
          startAdvancedFaceDetection();
        } catch (playError) {
          console.error("Video play error:", playError);
          setError(
            "Failed to play the video. Please click anywhere to allow playback."
          );
        }
      };

      videoEl.onerror = (e) => {
        console.error("Video element error:", e);
        setError("An error occurred while playing the video.");
      };
    } catch (err: any) {
      console.error("Camera access error:", err);
      if (err.name === "NotAllowedError") {
        setError(
          "Camera access denied. Please allow camera permissions and try again."
        );
      } else if (err.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else if (err.name === "NotSupportedError") {
        setError("Camera not supported in this browser.");
      } else {
        setError(`Camera error: ${err.message || "Unknown error"}`);
      }
    }
  };

  // Simple face detection using basic image analysis
  const startAdvancedFaceDetection = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    detectionInterval.current = setInterval(async () => {
      if (video.readyState !== 4) return;

      const results = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();
      const count = results.length;
      setFaceCount(count);
      setFaceDetected(count > 0);
      if (count === 0) {
        setExpressionDetected(null);
        setIsLookingAtScreen(null);
      }

      if (count === 1 && results[0]?.expressions && results[0]?.landmarks) {
        const exp = results[0].expressions;
        const maxExp = (
          Object.keys(exp) as (keyof faceapi.FaceExpressions)[]
        ).reduce((a, b) => (exp[a] > exp[b] ? a : b));
        setExpressionDetected(maxExp);

        const landmarks = results[0].landmarks;
        const jaw = landmarks.getJawOutline?.() || [];
        const eyeLeft = landmarks.getLeftEye?.() || [];
        const eyeRight = landmarks.getRightEye?.() || [];
        const nose = landmarks.getNose?.() || [];

        const isReal =
          jaw.length > 0 &&
          eyeLeft.length > 0 &&
          eyeRight.length > 0 &&
          nose.length > 0;
        setIsRealFace(isReal);
        if (!isReal) setFailureReason("Wajah kemungkinan gambar/foto.");

        // Deteksi arah pandangan mata (kasar)
        const getAspectRatio = (eye: faceapi.Point[]) => {
          const width = Math.hypot(eye[3].x - eye[0].x, eye[3].y - eye[0].y);
          const height = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
          return width / height;
        };

        if (eyeLeft.length >= 6 && eyeRight.length >= 6) {
          const leftAR = getAspectRatio(eyeLeft);
          const rightAR = getAspectRatio(eyeRight);
          const avgAR = (leftAR + rightAR) / 2;
          const looking = avgAR > 3.0; // threshold bisa kamu sesuaikan
          setIsLookingAtScreen(looking);
        } else {
          setIsLookingAtScreen(null);
        }
      }

      if (count > 1 && !multiFaceTimer.current) {
        multiFaceTimer.current = setTimeout(() => {
          setFailureReason("Terdeteksi lebih dari satu wajah dalam frame!");
          multiFaceTimer.current = null;
        }, 5000);
      } else if (count <= 1 && multiFaceTimer.current) {
        clearTimeout(multiFaceTimer.current);
        multiFaceTimer.current = null;
      }

      // Kosongkan canvas, tidak render kotak atau teks lagi
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }, 200);
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    if (detectionInterval.current) {
      clearInterval(detectionInterval.current);
    }

    if (faceNotDetectedTimer.current) {
      clearTimeout(faceNotDetectedTimer.current);
      faceNotDetectedTimer.current = null;
    }
    if (multiFaceTimer.current) {
      clearTimeout(multiFaceTimer.current);
      multiFaceTimer.current = null;
    }
    setMultiFaceCounter(0);
    setFaceCount(0);

    setCameraReady(false);
    setFaceDetected(false);
    setTabInactiveCount(0); // kalau pakai deteksi tab juga
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-mono overflow-x-hidden">
      {failureReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-red-500 border-8 border-black text-black p-10 text-center brutal-shadow transform rotate-1 max-w-lg w-full mx-4">
            <h2 className="text-5xl font-black uppercase mb-4">❌ GAGAL</h2>
            <p className="text-xl font-bold mb-6">{failureReason}</p>
            <button
              onClick={() => {
                stopCamera();
                setFailureReason(null);
              }}
              className="bg-yellow-300 hover:bg-yellow-200 text-black font-black text-xl p-4 border-4 border-black brutal-button uppercase"
            >
              COBA LAGI
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="border-b-4 border-yellow-400 bg-gradient-to-r from-purple-600 to-pink-600 p-6">
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-wider transform -skew-x-12 glitch">
          FACE TRACKER
        </h1>
        <p className="text-xl md:text-2xl font-bold mt-2 text-yellow-300">
          NEOBRUTALIST SURVEILLANCE SYSTEM
        </p>
      </header>

      {/* Debug Info */}
      <div className="p-4 bg-gray-900 border-b-2 border-gray-600">
        <div className="text-sm space-y-1">
          <div>
            Camera Permission:{" "}
            <span className="text-yellow-400">{cameraPermission}</span>
          </div>
          <div>
            Camera Ready:{" "}
            <span className="text-yellow-400">
              {cameraReady ? "YES" : "NO"}
            </span>
          </div>
          <div>
            Browser:{" "}
            <span className="text-yellow-400">{userAgent ?? "Loading..."}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Camera Section */}
        <div className="space-y-6">
          <div className="bg-red-500 border-4 border-white p-6 transform rotate-1 brutal-shadow">
            <h2 className="text-3xl font-black uppercase mb-4">CAMERA FEED</h2>

            <div className="space-y-4">
              <div className="relative border-4 border-cyan-400 bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-auto block bg-gray-800"
                  style={{ minHeight: "240px" }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  style={{ mixBlendMode: "screen" }}
                />
                {expressionDetected && (
                  <div className="mt-2 text-center text-lg font-bold text-yellow-300">
                    Ekspresi: {expressionDetected.toUpperCase()}
                  </div>
                )}
                {isLookingAtScreen !== null && (
                  <div
                    className={`mt-2 text-center text-sm font-bold ${
                      isLookingAtScreen ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {isLookingAtScreen
                      ? "✅ Melihat layar"
                      : "❌ Tidak melihat layar"}
                  </div>
                )}

                {/* Video status indicator */}
                {cameraReady && (
                  <div className="absolute top-2 right-2 bg-green-400 text-black px-2 py-1 text-xs font-bold border-2 border-black">
                    LIVE
                  </div>
                )}
              </div>

              {/* Kondisi kamera belum siap dan belum ada error */}
              {!cameraReady && !error && (
                <>
                  <button
                    onClick={startCamera}
                    className="w-full bg-green-400 hover:bg-green-300 text-black font-black text-xl p-4 border-4 border-black brutal-button uppercase"
                  >
                    START CAMERA
                  </button>
                  <div className="text-sm bg-black p-3 border-2 border-gray-600">
                    <p>• Allow camera permissions when prompted</p>
                    <p>• Make sure you have a camera connected</p>
                    <p>• Try refreshing if it doesn't work</p>
                  </div>
                </>
              )}

              {/* Error handling */}
              {error && (
                <>
                  <div className="bg-yellow-300 text-black p-4 border-4 border-red-600 font-bold">
                    ERROR: {error}
                  </div>
                  <button
                    onClick={startCamera}
                    className="w-full bg-blue-400 hover:bg-blue-300 text-black font-black text-lg p-3 border-4 border-black brutal-button uppercase"
                  >
                    TRY AGAIN
                  </button>
                </>
              )}

              {/* Tombol stop */}
              {cameraReady && (
                <button
                  onClick={stopCamera}
                  className="w-full bg-red-400 hover:bg-red-300 text-black font-black text-lg p-3 border-4 border-black brutal-button uppercase"
                >
                  STOP CAMERA
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Section */}
        <div className="space-y-6">
          {/* Face Status */}
          <div
            className={`border-4 p-6 transform -rotate-1 brutal-shadow ${
              faceDetected
                ? "bg-green-400 border-green-800"
                : "bg-red-400 border-red-800"
            }`}
          >
            <h3 className="text-2xl font-black uppercase mb-4 text-black">
              FACE STATUS
            </h3>
            <div className="text-black">
              <div className="text-4xl font-black mb-2 neon-glow">
                {faceDetected ? "✓ DETECTED" : "✗ NOT DETECTED"}
              </div>
              <div className="text-lg font-bold">
                {faceDetected ? "HUMAN PRESENCE CONFIRMED" : "NO FACE IN VIEW"}
              </div>
            </div>
          </div>

          <div
            className={`border-4 p-6 brutal-shadow ${
              faceCount > 1
                ? "bg-yellow-300 border-yellow-600"
                : "bg-green-200 border-green-500"
            }`}
          >
            <h3 className="text-2xl font-black uppercase mb-2 text-black">
              Wajah Terdeteksi
            </h3>
            <div className="text-black text-4xl font-extrabold">
              {faceCount}
            </div>
            {faceCount > 1 && (
              <p className="text-black font-bold mt-2">
                ⚠️ Lebih dari satu wajah terdeteksi!
              </p>
            )}
          </div>

          {/* Tab Status */}
          <div
            className={`border-4 p-6 transform rotate-1 brutal-shadow ${
              tabActive
                ? "bg-blue-400 border-blue-800"
                : "bg-orange-400 border-orange-800"
            }`}
          >
            <h3 className="text-2xl font-black uppercase mb-4 text-black">
              TAB STATUS
            </h3>
            <div className="text-black">
              <div className="text-4xl font-black mb-2">
                {tabActive ? "● ACTIVE" : "○ INACTIVE"}
              </div>
              <div className="text-lg font-bold">
                {tabActive ? "WINDOW IS FOCUSED" : "WINDOW IS HIDDEN"}
              </div>
            </div>
          </div>

          {/* System Info */}
          <div className="bg-purple-500 border-4 border-white p-6 brutal-shadow scan-line">
            <h3 className="text-2xl font-black uppercase mb-4">SYSTEM INFO</h3>
            <div className="space-y-2 text-lg font-bold">
              <div>CAMERA: {cameraReady ? "✓ READY" : "✗ OFFLINE"}</div>
              <div>DETECTION: {cameraReady ? "🔄 RUNNING" : "⏸ STOPPED"}</div>
              <div>PERMISSION: {cameraPermission.toUpperCase()}</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-4 border-yellow-400 bg-gradient-to-r from-green-600 to-blue-600 p-6 mt-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="bg-black border-4 border-white p-4 transform -rotate-1 brutal-shadow">
            <div className="text-2xl font-black">PRIVACY</div>
            <div className="text-sm font-bold">ALL DATA STAYS LOCAL</div>
          </div>
          <div className="bg-black border-4 border-white p-4 brutal-shadow">
            <div className="text-2xl font-black">REAL-TIME</div>
            <div className="text-sm font-bold">200MS DETECTION RATE</div>
          </div>
          <div className="bg-black border-4 border-white p-4 transform rotate-1 brutal-shadow">
            <div className="text-2xl font-black">BRUTAL</div>
            <div className="text-sm font-bold">UNCOMPROMISING DESIGN</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

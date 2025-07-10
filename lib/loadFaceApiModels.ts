// lib/loadFaceApiModels.ts
import * as faceapi from "face-api.js";

export const loadFaceApiModels = async () => {
  const MODEL_URL = "/models"; // nanti kita taruh model di /public/models
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
};

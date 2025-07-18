// lib/loadFaceApiModels.ts
import * as faceapi from "face-api.js";

export const loadFaceApiModels = async () => {
  const MODEL_URL = "/models"; // nanti kita taruh model di /public/models
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]);
};

import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";


const combineMap = {
  cut_press: "./img/final1.png",
  heat_peel: "./img/final2.png",
  cut_peel: "./img/final3.png",
};
// =================================================
// ✋ Left Hand UI: cut + heat
// =================================================
const gestureContentLeft = {
  Open_Palm: {
    mode: "cut",
    img: "./img/cut it.png",
    audio: "./audio/cut.mp3"
  },
  Thumb_Up: {
    mode: "heat",
    img: "./img/heat it.png",
    audio: "./audio/heat.mp3"
  }
};

// =================================================
// 🤚 Right Hand UI: peel + press
// =================================================
const gestureContentRight = {
  Pointing_Up: {
    mode: "peel",
    img: "./img/peel it.png",
    audio: "./audio/peel.mp3"
  },
  Closed_Fist: {
    mode: "press",
    img: "./img/press it.png",
    audio: "./audio/press.mp3"
  }
};

// =================================================
// State
// =================================================
const gestureState = {
  0: { current: "Unknown", candidate: "Unknown", count: 0 },
  1: { current: "Unknown", candidate: "Unknown", count: 0 }
};

const lastPlayed = {};
const audioCache = {};

let leftHandPos = null;
let rightHandPos = null;
let leftHandGesture = "Unknown";
let rightHandGesture = "Unknown";

let handsAreClose = false;

// background stages
let stages = {
  peel: 1,
  press: 1,
  cut: 1,
  heat: 1
};

let activeMode = "peel";

let rightWasAbove = false;
let leftWasAbove = false;

// hat smoothing
let hatX = null;
let hatY = null;

const STABILITY = 2;

// =================================================
// DOM
// =================================================
const video = document.querySelector("#video");
const leftDiv = document.querySelector("#left");
const rightDiv = document.querySelector("#right");
const specialDiv = document.querySelector("#special");
const hat = document.querySelector("#hat");

// =================================================
// Preload images
// =================================================
function preloadImages() {
  const imageList = [
    "./img/peel1.png", "./img/peel2.png", "./img/peel3.png", "./img/peel4.png",
    "./img/press1.png", "./img/press2.png", "./img/press3.png", "./img/press4.png",
    "./img/cut1.png", "./img/cut2.png", "./img/cut3.png", "./img/cut4.png",
    "./img/heat1.png", "./img/heat2.png", "./img/heat3.png", "./img/heat4.png",
    "./img/cut it.png", "./img/heat it.png", "./img/peel it.png", "./img/press it.png",
    "./img/hat.png"
  ];

  return Promise.all(
    imageList.map((src) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = src;
      });
    })
  );
}

// =================================================
// Audio helper
// =================================================
function playCachedAudio(key, src) {
  if (!audioCache[key]) {
    audioCache[key] = new Audio(src);
  }

  const sound = audioCache[key];
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

// =================================================
// Stable gesture
// =================================================
function getStableGesture(i, raw) {
  const s = gestureState[i];

  if (raw === s.candidate) {
    s.count++;
  } else {
    s.candidate = raw;
    s.count = 0;
  }

  if (s.count > STABILITY) {
    s.current = s.candidate;
  }

  return s.current;
}

// =================================================
// Update hand UI
// =================================================
function updateUI(div, gesture, handIndex, isLeft) {
  const map = isLeft ? gestureContentLeft : gestureContentRight;
  const content = map[gesture];

  if (!content) {
    if (lastPlayed[handIndex] !== "Unknown") {
      div.innerHTML = "";
      lastPlayed[handIndex] = "Unknown";
    }
    return;
  }

  if (gesture !== lastPlayed[handIndex]) {
    div.innerHTML = "";

    const img = document.createElement("img");
    img.src = content.img;
    div.appendChild(img);

    lastPlayed[handIndex] = gesture;

    if (content.audio) {
      playCachedAudio(`${gesture}-${handIndex}`, content.audio);
    }
  }
}
// =================================================
// Render background
// =================================================
function renderBackground() {
  document.body.style.backgroundImage = `url('./img/${activeMode}${stages[activeMode]}.png')`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundRepeat = "no-repeat";
}

// =================================================
// Trigger stage
// =================================================
function triggerMode(mode) {
  if (!mode) return;

  activeMode = mode;

  if (stages[mode] < 4) {
    stages[mode]++;
  }

  renderBackground();
  console.log(`${mode} stage:`, stages[mode]);
}

// =================================================
// Left hand controls cut + heat
// =================================================
function updateLeftHandAction() {
  const triggerY = window.innerHeight * 0.35;

  if (!leftHandPos) {
    leftWasAbove = false;
    return;
  }

  const isAbove = leftHandPos.y < triggerY;

  if (isAbove && !leftWasAbove) {
    const content = gestureContentLeft[leftHandGesture];
    if (content) {
      triggerMode(content.mode);
    }
  }

  leftWasAbove = isAbove;
}

// =================================================
// Right hand controls peel + press
// =================================================
function updateRightHandAction() {
  const triggerY = window.innerHeight * 0.35;

  if (!rightHandPos) {
    rightWasAbove = false;
    return;
  }

  const isAbove = rightHandPos.y < triggerY;

  if (isAbove && !rightWasAbove) {
    const content = gestureContentRight[rightHandGesture];
    if (content) {
      triggerMode(content.mode);
    }
  }

  rightWasAbove = isAbove;
}

// =================================================
// Hands close effect
// =================================================
function updateHandDistanceEffect() {
  const threshold = 150;

  if (leftHandPos && rightHandPos) {
    const d = Math.hypot(
      leftHandPos.x - rightHandPos.x,
      leftHandPos.y - rightHandPos.y
    );

    const leftHasTool = gestureContentLeft[leftHandGesture];
    const rightHasTool = gestureContentRight[rightHandGesture];

    if (d < threshold && leftHasTool && rightHasTool) {
      if (!handsAreClose) {
        handsAreClose = true;

        const key = `${leftHasTool.mode}_${rightHasTool.mode}`;
        const finalImg = combineMap[key];

        if (finalImg) {
          document.body.style.backgroundImage = `url('${finalImg}')`;
          document.body.style.backgroundSize = "cover";
          document.body.style.backgroundPosition = "center";
          document.body.style.backgroundRepeat = "no-repeat";
        }

        specialDiv.innerHTML = "";
        specialDiv.textContent = "";

        leftDiv.innerHTML = "";
        rightDiv.innerHTML = "";

        playCachedAudio("touch-sound", "./audio/peel.mp3");

        console.log("Final image:", key, finalImg);
      }
    } else {
      handsAreClose = false;
    }
  } else {
    handsAreClose = false;
  }
}
// =================================================
// Hat follows face
// =================================================
function updateHatByFace(faceLandmarks) {
  if (!hat || !faceLandmarks || faceLandmarks.length === 0) return;

  const landmarks = faceLandmarks[0];
  const forehead = landmarks[10];
  if (!forehead) return;

  let x = forehead.x * window.innerWidth;
  let y = forehead.y * window.innerHeight;

  x = window.innerWidth - x;
  y = y - 90;

  if (hatX === null || hatY === null) {
    hatX = x;
    hatY = y;
  } else {
    hatX += (x - hatX) * 0.35;
    hatY += (y - hatY) * 0.35;
  }

  hat.style.left = `${hatX}px`;
  hat.style.top = `${hatY + 30}px`;
}

// =================================================
// Setup camera
// =================================================
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "user" }
});

video.srcObject = stream;
await video.play();

// =================================================
// Load MediaPipe
// =================================================
const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);

const recognizer = await GestureRecognizer.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task"
  },
  runningMode: "VIDEO",
  numHands: 2
});

const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
  },
  runningMode: "VIDEO",
  numFaces: 1
});

// =================================================
// Main loop
// =================================================
async function loop() {
  const now = performance.now();

  const gestureResult = await recognizer.recognizeForVideo(video, now);
  const faceResult = await faceLandmarker.detectForVideo(video, now);

  leftHandPos = null;
  rightHandPos = null;
  leftHandGesture = "Unknown";
  rightHandGesture = "Unknown";

  if (gestureResult.landmarks) {
    for (let i = 0; i < gestureResult.landmarks.length; i++) {
      const lm = gestureResult.landmarks[i];

      let x = lm[9].x * window.innerWidth;
      let y = lm[9].y * window.innerHeight;

      x = window.innerWidth - x;

      const handedness =
        gestureResult.handednesses?.[i]?.[0]?.categoryName || "Right";

      const isLeft = handedness === "Left";
      const target = isLeft ? leftDiv : rightDiv;

      target.style.left = `${x-40}px`;
      target.style.top = `${y-40}px`;

      let raw = "Unknown";

      if (gestureResult.gestures?.[i]?.[0]) {
        raw = gestureResult.gestures[i][0].categoryName;
      }

      const gesture = getStableGesture(i, raw);

      if (isLeft) {
        leftHandPos = { x, y };
        leftHandGesture = gesture;
      } else {
        rightHandPos = { x, y };
        rightHandGesture = gesture;
      }

      updateUI(target, gesture, i, isLeft);
    }
  }

  if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
    updateHatByFace(faceResult.faceLandmarks);
  }

  updateLeftHandAction();
  updateRightHandAction();
  updateHandDistanceEffect();

  requestAnimationFrame(loop);
}

// =================================================
// Start
// =================================================
await preloadImages();
renderBackground();
loop();
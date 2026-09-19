import p5 from "p5";
import sketchWasmUrl from "./generated/sketch.wasm?url";
import {
  appendBoundedPoint,
  measurePath,
  resamplePath,
} from "../../shared/strip-path.js";
import { stripLink } from "../../shared/strip-transfer.js";
import "./style.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="app-shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Two ends · one moment</p>
        <h1>LED Game</h1>
      </div>
      <p class="masthead-copy">
        Launch opposing Pulses. Make their Collision Span overlap the
        breathing Target Zone.
      </p>
    </header>

    <section class="game-panel" aria-label="LED Game">
      <div id="canvas-host" class="canvas-host">
        <div id="draw-overlay" class="draw-overlay" aria-live="polite" hidden>
          <div class="draw-mode-copy">
            <span class="draw-mode-label">Draw mode</span>
            <strong id="draw-prompt">Press and drag to shape the strip</strong>
          </div>
          <div class="draw-capacity">
            <div class="draw-capacity-track" aria-hidden="true">
              <span id="draw-capacity-fill"></span>
            </div>
            <span id="draw-capacity-label" class="draw-capacity-label">0% of 90-light reach</span>
          </div>
        </div>
        <button
          id="fullscreen-button"
          class="fullscreen-button"
          type="button"
          aria-label="Enter fullscreen"
          aria-pressed="false"
        >
          <svg
            class="fullscreen-icon-enter"
            viewBox="0 0 16 16"
            width="13"
            height="13"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg
            class="fullscreen-icon-exit"
            viewBox="0 0 16 16"
            width="13"
            height="13"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div class="instrument-panel">
        <div class="layout-tools">
          <div>
            <span class="readout-label">Strip layout</span>
            <span id="layout-state" class="layout-state">Double crest</span>
          </div>
          <div class="layout-tools-actions">
            <div
              class="layout-presets"
              role="group"
              aria-label="Strip presets"
            ></div>
            <button
              id="draw-mode-button"
              class="draw-mode-button"
              type="button"
              aria-pressed="false"
            >
              <span id="draw-button-label">Draw</span>
              <span class="draw-button-mark" aria-hidden="true">90</span>
            </button>
            <button
              id="simulate-button"
              class="simulate-button"
              type="button"
              aria-label="Simulate this Strip Path in the gallery room"
              hidden
            >
              Simulate
            </button>
          </div>
        </div>
        <p id="simulate-note" class="simulate-note" role="status" hidden></p>
        <div class="status-row">
          <div class="readout readout-primary">
            <p id="status-message" class="status-message" aria-live="polite">
              Press a control or Arrow key to launch a Pulse.
            </p>
          </div>

          <div class="readout">
            <span class="readout-label">Target Zone</span>
            <span id="target-zone-size" class="readout-value">—</span>
          </div>

          <div class="readout">
            <span class="readout-label">Miss Streak</span>
            <div class="miss-pips" aria-label="0 of 3 Misses">
              <span class="miss-pip"></span>
              <span class="miss-pip"></span>
              <span class="miss-pip"></span>
            </div>
          </div>
        </div>

        <div class="controls" aria-label="Endpoint controls">
          <button
            class="endpoint-control"
            data-side="left"
            type="button"
            aria-label="Launch the left Pulse"
            aria-keyshortcuts="ArrowLeft"
            aria-pressed="false"
          >
            <span class="control-face">
              <span class="control-name">Left Pulse</span>
              <span class="control-key" aria-hidden="true">←</span>
            </span>
          </button>

          <span class="control-divider" aria-hidden="true">launch</span>

          <button
            class="endpoint-control"
            data-side="right"
            type="button"
            aria-label="Launch the right Pulse"
            aria-keyshortcuts="ArrowRight"
            aria-pressed="false"
          >
            <span class="control-face">
              <span class="control-name">Right Pulse</span>
              <span class="control-key" aria-hidden="true">→</span>
            </span>
          </button>
        </div>

        <p class="hint">
          Press a control or Arrow key to launch a Pulse · meet inside the Target
          Zone
        </p>
        <p class="hint sketch-source">Running <code id="sketch-source"></code></p>
      </div>
    </section>
  </main>
`;

const root = app.querySelector(".app-shell");
const canvasHost = app.querySelector("#canvas-host");
const statusMessageElement = app.querySelector("#status-message");
const targetZoneSizeElement = app.querySelector("#target-zone-size");
const missPipsElement = app.querySelector(".miss-pips");
const drawOverlay = app.querySelector("#draw-overlay");
const drawPrompt = app.querySelector("#draw-prompt");
const drawCapacityFill = app.querySelector("#draw-capacity-fill");
const drawCapacityLabel = app.querySelector("#draw-capacity-label");
const drawModeButton = app.querySelector("#draw-mode-button");
const drawButtonLabel = app.querySelector("#draw-button-label");
const layoutState = app.querySelector("#layout-state");
const presetGroup = app.querySelector(".layout-presets");
const fullscreenButton = app.querySelector("#fullscreen-button");
const simulateButton = app.querySelector("#simulate-button");
const simulateNote = app.querySelector("#simulate-note");
const sketchSourceElement = app.querySelector("#sketch-source");
const missPips = [...app.querySelectorAll(".miss-pip")];
const buttons = {
  left: app.querySelector('[data-side="left"]'),
  right: app.querySelector('[data-side="right"]'),
};

// Baked in by the build from the same target resolution the compiler used.
sketchSourceElement.textContent = __SKETCH_PATH__;

const pointerHolds = {
  left: new Set(),
  right: new Set(),
};
const pressedKeys = new Set();
const keyCodes = {
  left: new Set(["ArrowLeft"]),
  right: new Set(["ArrowRight"]),
};
let drawModeActive = false;

function isHeld(side) {
  if (drawModeActive) return false;
  if (pointerHolds[side].size > 0) return true;
  for (const binding of keyCodes[side]) {
    if (pressedKeys.has(binding)) return true;
  }
  return false;
}

function updateControlPresentation() {
  for (const side of ["left", "right"]) {
    const held = isHeld(side);
    buttons[side].classList.toggle("is-held", held);
    buttons[side].setAttribute("aria-pressed", String(held));
    buttons[side].disabled = drawModeActive;
  }
}

for (const side of ["left", "right"]) {
  const button = buttons[side];
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pointerHolds[side].add(event.pointerId);
    updateControlPresentation();
  });
  button.addEventListener("click", (event) => event.preventDefault());
}

function releasePointer(event) {
  pointerHolds.left.delete(event.pointerId);
  pointerHolds.right.delete(event.pointerId);
  updateControlPresentation();
}

function holdEndpointFromCanvas(event) {
  if (drawModeActive) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const bounds = canvasElement.getBoundingClientRect();
  const side =
    event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
  event.preventDefault();
  pointerHolds[side].add(event.pointerId);
  updateControlPresentation();
}

window.addEventListener("pointerup", releasePointer);
window.addEventListener("pointercancel", releasePointer);

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && drawModeActive) {
    event.preventDefault();
    exitDrawMode();
    return;
  }
  if (
    event.code !== "ArrowLeft" &&
    event.code !== "ArrowRight"
  ) {
    return;
  }
  event.preventDefault();
  if (drawModeActive) return;
  pressedKeys.add(event.code);
  updateControlPresentation();
});

window.addEventListener("keyup", (event) => {
  if (
    event.code !== "ArrowLeft" &&
    event.code !== "ArrowRight"
  ) {
    return;
  }
  event.preventDefault();
  pressedKeys.delete(event.code);
  updateControlPresentation();
});

window.addEventListener("blur", () => {
  pressedKeys.clear();
  pointerHolds.left.clear();
  pointerHolds.right.clear();
  if (drawModeActive && drawingPointerId !== null) {
    drawingPointerId = null;
    drawRejected = true;
    updateDrawInterface();
  }
  updateControlPresentation();
});

// The Sketch owns its light count and publishes every Frame with its own
// length; the page only needs the number to lay out the Strip Path it draws.
const NUM_LEDS = 90;
const CANVAS_WIDTH = 1180;
const INITIAL_CANVAS_HEIGHT = 320;
const DRAW_CANVAS_HEIGHT = 720;
const MINIMUM_PLAY_CANVAS_HEIGHT = 220;
const STRIP_VERTICAL_PADDING = 56;
const STRIP_LEFT = 46;
const STRIP_RIGHT = CANVAS_WIDTH - 46;
const STRIP_CENTER_Y = INITIAL_CANVAS_HEIGHT / 2;
const STRIP_AMPLITUDE = 58;
const LED_SPACING =
  (STRIP_RIGHT - STRIP_LEFT) / (NUM_LEDS - 1);
const LED_DIAMETER = Math.min(8.5, LED_SPACING * 0.72);
const DRAW_MARGIN_X = 38;
const DRAW_MARGIN_Y = STRIP_VERTICAL_PADDING;

function createDefaultStripPath() {
  return Array.from({ length: NUM_LEDS }, (_, position) => {
    const progress = position / (NUM_LEDS - 1);
    return {
      x: STRIP_LEFT + position * LED_SPACING,
      y: STRIP_CENTER_Y - Math.sin(progress * Math.PI * 3) * STRIP_AMPLITUDE,
    };
  });
}

// The Peak strip path: sixty-four control points traced from the neon strip
// inside the marked area of the reference photograph, in canvas coordinates.
// resamplePath expands them to the ninety light positions.
const PEAK_STRIP_PATH_POINTS = Object.freeze([
  [382.6, 537.6], [392.7, 528.0], [405.9, 523.3], [419.2, 519.2],
  [432.3, 514.2], [445.3, 509.2], [455.9, 500.0], [466.3, 490.7],
  [476.1, 480.6], [484.3, 469.2], [491.7, 457.3], [499.6, 445.8],
  [505.9, 433.2], [512.8, 421.0], [519.0, 408.4], [524.8, 395.6],
  [528.4, 382.1], [532.7, 368.8], [536.7, 355.4], [538.0, 341.5],
  [539.6, 327.6], [537.7, 313.7], [540.3, 299.9], [546.4, 287.2],
  [548.4, 273.4], [550.5, 259.6], [551.0, 245.6], [552.6, 231.6],
  [555.0, 217.8], [558.8, 204.3], [565.1, 191.8], [572.3, 179.7],
  [583.6, 171.8], [597.4, 169.4], [610.9, 172.9], [621.8, 181.5],
  [628.7, 193.7], [633.5, 206.8], [638.1, 220.1], [643.3, 233.1],
  [646.0, 246.8], [646.6, 260.8], [649.4, 274.6], [650.7, 288.6],
  [654.7, 302.0], [657.8, 315.7], [662.2, 329.0], [666.9, 342.2],
  [671.8, 355.3], [676.3, 368.5], [681.4, 381.6], [687.7, 394.1],
  [693.5, 406.9], [700.2, 419.2], [705.5, 432.2], [712.0, 444.6],
  [720.2, 455.9], [728.7, 467.1], [737.3, 478.2], [747.2, 488.2],
  [758.0, 496.9], [771.6, 500.5], [784.8, 505.0], [797.4, 511.2],
]);

function buildCrestPreset() {
  return { path: defaultStripPath, height: INITIAL_CANVAS_HEIGHT };
}

function buildPeakPreset() {
  return cropPathVertically(
    resamplePath(
      PEAK_STRIP_PATH_POINTS.map(([x, y]) => ({ x, y })),
      NUM_LEDS,
    ),
  );
}

const STRIP_PRESETS = Object.freeze([
  {
    id: "crest",
    label: "Default",
    state: "Double crest · 90 lights",
    description: "following a double-crest curve",
    build: buildCrestPreset,
  },
  {
    id: "peak",
    label: "Peak",
    state: "Peak · 90 lights",
    description: "following the Peak arch",
    build: buildPeakPreset,
  },
]);

function presetById(id) {
  return STRIP_PRESETS.find((preset) => preset.id === id) ?? null;
}

const defaultStripPath = createDefaultStripPath();
const MAXIMUM_DRAW_LENGTH = measurePath(defaultStripPath);
const MINIMUM_DRAW_LENGTH = LED_SPACING * 6;
const STRIP_PATH_STORAGE_KEY = "ledgame.stripPath";

function readSavedStrip() {
  let raw;
  try {
    raw = window.localStorage.getItem(STRIP_PATH_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof saved?.preset === "string") {
    return presetById(saved.preset) ? { preset: saved.preset } : null;
  }

  if (
    !Array.isArray(saved?.path) ||
    saved.path.length !== NUM_LEDS
  ) {
    return null;
  }
  if (!Number.isFinite(saved.height)) return null;

  const path = [];
  for (const location of saved.path) {
    if (!Array.isArray(location) || location.length !== 2) return null;
    const [x, y] = location;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    path.push({ x, y });
  }

  return { height: saved.height, path };
}

function saveStripPreset(id) {
  try {
    window.localStorage.setItem(
      STRIP_PATH_STORAGE_KEY,
      JSON.stringify({ preset: id }),
    );
  } catch {
    // Storage can be unavailable or full; the selection will not persist.
  }
}

function saveStripPath(path, height) {
  try {
    window.localStorage.setItem(
      STRIP_PATH_STORAGE_KEY,
      JSON.stringify({
        height,
        path: path.map((location) => [location.x, location.y]),
      }),
    );
  } catch {
    // Storage can be unavailable or full; the level simply will not persist.
  }
}

const savedStrip = readSavedStrip();
const savedPreset =
  savedStrip && savedStrip.preset ? presetById(savedStrip.preset) : null;
const builtPreset = savedPreset ? savedPreset.build() : null;

let activePresetId = savedPreset ? savedPreset.id : savedStrip ? null : "crest";
let stripPath = builtPreset
  ? builtPreset.path
  : savedStrip
    ? savedStrip.path
    : defaultStripPath;
let draftPath = [];
let draftPreview = [];
let draftLength = 0;
let drawingPointerId = null;
let drawLimitReached = false;
let drawRejected = false;
let canvasHeight = builtPreset
  ? builtPreset.height
  : savedStrip
    ? savedStrip.height
    : INITIAL_CANVAS_HEIGHT;
let playCanvasHeight = canvasHeight;
let resizeSketch = null;
let canvasElement;
let lastStatusKey = "";

// The Sketch publishes a Frame on every FastLED.show() and the page keeps its own
// snapshot, because the published view expires with the call.
let ledPixels = new Uint8Array(0);
let brightness = 255;
// The Target Zone's bounds in lights, read back from the amber run a Frame paints.
let zoneStart = -1;
let zoneEnd = -1;
// What the Sketch reports about Progress: its serial lines and nothing else.
const IDLE_STATUS = "Press a control or Arrow key to launch a Pulse.";
let statusLine = IDLE_STATUS;
let missStreak = 0;
let maxMissStreak = 3;
// A recompiled Sketch cannot take over a running module, so the page boots a new
// instance and cancels the old one through the Facade. Exactly one instance may
// publish Frames and read the controls, which these two ids decide.
let issuedInstance = 0;
let liveInstance = 0;
let currentModule = null;
const serialInput = [];

function renderPanel() {
  const zoneSize = zoneStart >= 0 ? zoneEnd - zoneStart + 1 : 0;
  const statusKey = [statusLine, zoneSize, missStreak, maxMissStreak].join("|");
  if (statusKey === lastStatusKey) return;
  lastStatusKey = statusKey;

  statusMessageElement.textContent = statusLine;
  targetZoneSizeElement.textContent =
    zoneStart < 0
      ? "—"
      : `${zoneSize} ${zoneSize === 1 ? "light" : "lights"}`;
  missPips.forEach((pip, index) => {
    pip.classList.toggle("is-active", index < missStreak);
  });
  missPipsElement.setAttribute(
    "aria-label",
    `${missStreak} of ${maxMissStreak} Misses`,
  );
}

function fitCanvasToViewport() {
  if (!canvasElement || document.fullscreenElement !== canvasHost) return;
  const fitScale = Math.min(
    canvasHost.clientWidth / CANVAS_WIDTH,
    canvasHost.clientHeight / canvasHeight,
  );
  canvasElement.style.setProperty(
    "width",
    `${Math.floor(CANVAS_WIDTH * fitScale)}px`,
    "important",
  );
  canvasElement.style.setProperty(
    "height",
    `${Math.floor(canvasHeight * fitScale)}px`,
    "important",
  );
}

function clearCanvasFit() {
  if (!canvasElement) return;
  canvasElement.style.removeProperty("width");
  canvasElement.style.removeProperty("height");
}

function syncFullscreenState() {
  const active = document.fullscreenElement === canvasHost;
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute(
    "aria-label",
    active ? "Exit fullscreen" : "Enter fullscreen",
  );
  if (active) fitCanvasToViewport();
  else clearCanvasFit();
}

fullscreenButton.addEventListener("click", () => {
  if (document.fullscreenElement === canvasHost) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  canvasHost.requestFullscreen().catch(() => {});
});

document.addEventListener("fullscreenchange", syncFullscreenState);
window.addEventListener("resize", fitCanvasToViewport);

if (!document.fullscreenEnabled) {
  fullscreenButton.hidden = true;
}

syncFullscreenState();

const NATIVE_GESTURE_TARGETS = "canvas, img, .endpoint-control";

function suppressNativeGestures(event) {
  if (
    !event.target.closest ||
    !event.target.closest(NATIVE_GESTURE_TARGETS)
  ) {
    return;
  }
  event.preventDefault();
}

app.addEventListener("contextmenu", suppressNativeGestures);
app.addEventListener("dragstart", suppressNativeGestures);

function stripCoordinate(position, axis) {
  const boundedPosition = Math.max(
    0,
    Math.min(NUM_LEDS - 1, position),
  );
  const lowerIndex = Math.floor(boundedPosition);
  const upperIndex = Math.min(
    NUM_LEDS - 1,
    lowerIndex + 1,
  );
  const fraction = boundedPosition - lowerIndex;
  return (
    stripPath[lowerIndex][axis] +
    (stripPath[upperIndex][axis] - stripPath[lowerIndex][axis]) * fraction
  );
}

function ledX(position) {
  return stripCoordinate(position, "x");
}

function ledY(position) {
  return stripCoordinate(position, "y");
}

function resetDraft() {
  draftPath = [];
  draftPreview = [];
  draftLength = 0;
  drawLimitReached = false;
  drawRejected = false;
}

function updateCanvasDescription() {
  if (!canvasElement) return;
  if (drawModeActive) {
    canvasElement.setAttribute(
      "aria-label",
      "DRAW mode canvas. Press and drag to create a path for ninety lights.",
    );
    return;
  }
  const preset = activePresetId ? presetById(activePresetId) : null;
  canvasElement.setAttribute(
    "aria-label",
    `A ninety-light ${
      preset ? `Strip Path ${preset.description}` : "custom-drawn Strip Path"
    }, with a breathing yellow Target Zone and white Pulses launched from its ends`,
  );
}

function updateDrawInterface() {
  const capacity = Math.min(1, draftLength / MAXIMUM_DRAW_LENGTH);
  const capacityPercent = Math.round(capacity * 100);

  root.classList.toggle("is-draw-mode", drawModeActive);
  canvasHost.classList.toggle("is-draw-mode", drawModeActive);
  drawOverlay.hidden = !drawModeActive;
  drawModeButton.setAttribute("aria-pressed", String(drawModeActive));
  drawButtonLabel.textContent = drawModeActive
    ? "Cancel"
    : activePresetId
      ? "Draw"
      : "Redraw";
  layoutState.textContent = drawModeActive
    ? "Drawing new path"
    : activePresetId
      ? presetById(activePresetId).state
      : "Custom path · 90 lights";

  for (const button of presetButtons) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.preset === activePresetId),
    );
    button.disabled = drawModeActive;
  }
  simulateButton.disabled = drawModeActive;

  drawCapacityFill.style.width = `${capacityPercent}%`;
  drawCapacityLabel.textContent = drawLimitReached
    ? "90-light limit reached"
    : `${capacityPercent}% of 90-light reach`;

  if (drawRejected) {
    drawPrompt.textContent = "That path is too short — draw again";
  } else if (drawLimitReached) {
    drawPrompt.textContent = "Maximum length reached — release to apply";
  } else if (draftPath.length === 0) {
    drawPrompt.textContent = "Press and drag to shape the strip";
  } else if (draftLength < MINIMUM_DRAW_LENGTH) {
    drawPrompt.textContent = "Keep drawing";
  } else {
    drawPrompt.textContent = "Release to apply all 90 lights";
  }

  updateCanvasDescription();
  updateControlPresentation();
}

function setCanvasHeight(height) {
  canvasHeight = Math.round(height);
  if (resizeSketch) resizeSketch(canvasHeight);
  fitCanvasToViewport();
}

function cropPathVertically(path) {
  let minimumY = Infinity;
  let maximumY = -Infinity;
  for (const location of path) {
    minimumY = Math.min(minimumY, location.y);
    maximumY = Math.max(maximumY, location.y);
  }

  const pathHeight = maximumY - minimumY;
  const cropHeight = Math.max(
    MINIMUM_PLAY_CANVAS_HEIGHT,
    Math.ceil(pathHeight + STRIP_VERTICAL_PADDING * 2),
  );
  const offsetY = (cropHeight - pathHeight) / 2 - minimumY;

  return {
    height: cropHeight,
    path: path.map((location) => ({
      x: location.x,
      y: location.y + offsetY,
    })),
  };
}

function enterDrawMode() {
  drawModeActive = true;
  playCanvasHeight = canvasHeight;
  setCanvasHeight(DRAW_CANVAS_HEIGHT);
  drawingPointerId = null;
  resetDraft();
  pressedKeys.clear();
  pointerHolds.left.clear();
  pointerHolds.right.clear();
  updateDrawInterface();
}

function exitDrawMode(restorePlayHeight = true) {
  drawModeActive = false;
  drawingPointerId = null;
  resetDraft();
  if (restorePlayHeight) setCanvasHeight(playCanvasHeight);
  updateDrawInterface();
}

function setActiveStrip(path, height, presetId) {
  stripPath = path;
  activePresetId = presetId;
  playCanvasHeight = height;
  setCanvasHeight(playCanvasHeight);
  updateDrawInterface();
}

function applyPreset(id) {
  const preset = presetById(id);
  if (!preset) return;
  const built = preset.build();
  setActiveStrip(built.path, built.height, preset.id);
  saveStripPreset(preset.id);
}

function canvasPositionFromEvent(event) {
  const bounds = canvasElement.getBoundingClientRect();
  return {
    x: Math.max(
      DRAW_MARGIN_X,
      Math.min(
        CANVAS_WIDTH - DRAW_MARGIN_X,
        ((event.clientX - bounds.left) / bounds.width) * CANVAS_WIDTH,
      ),
    ),
    y: Math.max(
      DRAW_MARGIN_Y,
      Math.min(
        canvasHeight - DRAW_MARGIN_Y,
        ((event.clientY - bounds.top) / bounds.height) * canvasHeight,
      ),
    ),
  };
}

function appendDraftPosition(location) {
  const result = appendBoundedPoint(
    draftPath,
    location,
    draftLength,
    MAXIMUM_DRAW_LENGTH,
    2,
  );
  draftLength = result.length;
  drawLimitReached = result.limitReached;
  if (result.appended && draftPath.length > 1) {
    draftPreview = resamplePath(draftPath, NUM_LEDS);
  }
  updateDrawInterface();
}

function beginDrawing(event) {
  if (!drawModeActive) return;
  if (drawingPointerId !== null) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  resetDraft();
  drawingPointerId = event.pointerId;
  appendDraftPosition(canvasPositionFromEvent(event));
}

function continueDrawing(event) {
  if (!drawModeActive || event.pointerId !== drawingPointerId) return;
  event.preventDefault();
  appendDraftPosition(canvasPositionFromEvent(event));
}

function finishDrawing(event) {
  if (!drawModeActive || event.pointerId !== drawingPointerId) return;
  event.preventDefault();
  appendDraftPosition(canvasPositionFromEvent(event));
  drawingPointerId = null;

  if (
    draftLength < MINIMUM_DRAW_LENGTH ||
    draftPreview.length !== NUM_LEDS
  ) {
    drawRejected = true;
    updateDrawInterface();
    return;
  }

  const cropped = cropPathVertically(draftPreview);
  setActiveStrip(cropped.path, cropped.height, null);
  saveStripPath(stripPath, playCanvasHeight);
  exitDrawMode(false);
}

function cancelDrawing(event) {
  if (!drawModeActive || event.pointerId !== drawingPointerId) return;
  drawingPointerId = null;
  drawRejected = true;
  updateDrawInterface();
}

function renderDraftPath(p, context) {
  p.noStroke();
  p.fill(8, 11, 16, 238);
  p.rect(0, 0, CANVAS_WIDTH, canvasHeight);

  const draftRed = drawLimitReached ? 255 : 120;
  const draftGreen = drawLimitReached ? 228 : 220;
  const draftBlue = drawLimitReached ? 91 : 255;

  p.noFill();
  p.stroke(draftRed, draftGreen, draftBlue, 150);
  p.strokeWeight(3);
  p.beginShape();
  for (const location of draftPath) {
    p.vertex(location.x, location.y);
  }
  p.endShape();

  context.shadowBlur = 10;
  context.shadowColor = `rgba(${draftRed}, ${draftGreen}, ${draftBlue}, 0.7)`;
  p.stroke(42, 49, 60);
  p.strokeWeight(1);
  p.fill(draftRed, draftGreen, draftBlue);
  for (const location of draftPreview) {
    p.circle(location.x, location.y, LED_DIAMETER);
  }
  context.shadowBlur = 0;
}

drawModeButton.addEventListener("click", () => {
  if (drawModeActive) {
    exitDrawMode();
    return;
  }
  enterDrawMode();
});

const presetButtons = STRIP_PRESETS.map((preset) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "layout-preset-button";
  button.dataset.preset = preset.id;
  button.textContent = preset.label;
  button.setAttribute("aria-pressed", String(preset.id === activePresetId));
  button.addEventListener("click", () => applyPreset(preset.id));
  presetGroup.append(button);
  return button;
});

const GALLERY_URL = import.meta.env.VITE_GALLERY_URL ?? "http://localhost:5199";

// The panel's transient line: gallery handoffs and Sketch recompiles both report
// here instead of adding a second notice element.
function showNote(message) {
  simulateNote.textContent = message;
  simulateNote.hidden = message.length === 0;
}

// The gallery is a separate application, so the Strip Path travels in the link
// and the room rehearses it under the same rules this canvas is running.
async function simulateInGallery() {
  const link = stripLink(GALLERY_URL, {
    width: CANVAS_WIDTH,
    height: playCanvasHeight,
    points: stripPath,
  });
  simulateButton.disabled = true;
  showNote("Handing your strip to the gallery…");

  try {
    await fetch(GALLERY_URL, { mode: "no-cors", cache: "no-store" });
  } catch {
    showNote(
      `No gallery answering at ${GALLERY_URL} — run pnpm dev in 3d/ and try again.`,
    );
    simulateButton.disabled = drawModeActive;
    return;
  }

  window.open(link, "_blank", "noopener");
  showNote("Your strip is mounted on the gallery wall.");
  simulateButton.disabled = drawModeActive;
}

simulateButton.addEventListener("click", simulateInGallery);

window.addEventListener("pointermove", continueDrawing, { passive: false });
window.addEventListener("pointerup", finishDrawing);
window.addEventListener("pointercancel", cancelDrawing);

new p5((p) => {
  p.setup = () => {
    const canvas = p.createCanvas(CANVAS_WIDTH, canvasHeight);
    canvas.parent(canvasHost);
    canvasElement = canvas.elt;
    canvasElement.setAttribute("role", "img");
    canvasElement.addEventListener("pointerdown", beginDrawing);
    canvasElement.addEventListener("pointerdown", holdEndpointFromCanvas);
    resizeSketch = (nextHeight) => p.resizeCanvas(CANVAS_WIDTH, nextHeight);
    p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
    p.frameRate(60);
    p.textFont("DM Mono");

    updateDrawInterface();
  };

  p.draw = () => {
    p.background(8, 11, 16);

    const context = p.drawingContext;
    const backdrop = context.createRadialGradient(
      CANVAS_WIDTH / 2,
      canvasHeight / 2,
      20,
      CANVAS_WIDTH / 2,
      canvasHeight / 2,
      CANVAS_WIDTH * 0.58,
    );
    backdrop.addColorStop(0, "rgba(52, 63, 78, 0.23)");
    backdrop.addColorStop(1, "rgba(8, 11, 16, 0)");
    context.fillStyle = backdrop;
    context.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

    if (drawModeActive && draftPath.length > 0) {
      renderDraftPath(p, context);
      return;
    }

    p.noFill();
    p.stroke(43, 51, 63);
    p.strokeWeight(2);
    p.beginShape();
    for (let index = 0; index < NUM_LEDS; index += 1) {
      p.vertex(ledX(index), ledY(index));
    }
    p.endShape();

    // The Frame's own length decides how many lights are painted, at the
    // brightness the Sketch set.
    const lightCount = ledPixels.length / 3;
    for (let index = 0; index < lightCount; index += 1) {
      const x = ledX(index);
      const y = ledY(index);
      const r = (ledPixels[index * 3] * brightness) / 255;
      const g = (ledPixels[index * 3 + 1] * brightness) / 255;
      const b = (ledPixels[index * 3 + 2] * brightness) / 255;
      const peak = Math.max(r, g, b);

      context.shadowBlur = peak > 40 ? 10 : 0;
      context.shadowColor = `rgba(${r}, ${g}, ${b}, 0.75)`;
      p.stroke(42, 49, 60);
      p.strokeWeight(1);
      p.fill(r, g, b);
      p.circle(x, y, LED_DIAMETER);
    }
    context.shadowBlur = 0;

    p.noStroke();
    p.fill(105, 116, 132);
    p.textSize(10);
    const leftEndpointX = ledX(0);
    const leftEndpointY = ledY(0);
    const rightEndpointX = ledX(NUM_LEDS - 1);
    const rightEndpointY = ledY(NUM_LEDS - 1);
    // A path that closes on itself (such as Peak) ends both strips in the same
    // place; stack the labels there instead of overprinting them.
    const endpointLabelsCollide =
      Math.abs(leftEndpointX - rightEndpointX) < 120 &&
      Math.abs(leftEndpointY - rightEndpointY) < 40;
    const leftLabelY = endpointLabelsCollide
      ? Math.max(leftEndpointY, rightEndpointY) + 24
      : leftEndpointY + 24;
    const rightLabelY = endpointLabelsCollide
      ? leftLabelY + 16
      : rightEndpointY + 24;

    p.textAlign(
      leftEndpointX < CANVAS_WIDTH / 2 ? p.LEFT : p.RIGHT,
      p.TOP,
    );
    p.text("01 · LEFT END", leftEndpointX, leftLabelY);
    p.textAlign(
      rightEndpointX < CANVAS_WIDTH / 2 ? p.LEFT : p.RIGHT,
      p.TOP,
    );
    p.text("RIGHT END · 90", rightEndpointX, rightLabelY);
  };
});

// The browser's stand-in for a serial monitor: sketchSerial('miss\n') queues bytes
// for a Sketch polling Serial.available()/read(), which is how a Miss is reported
// without a collision.
globalThis.sketchSerial = (text) => {
  for (const character of String(text)) serialInput.push(character.charCodeAt(0));
  return serialInput.length;
};

// The Sketch's own serial output, parsed for the only two things the panel shows.
const MISS_STREAK_LINE = /^Miss Streak: (\d+)\/(\d+)$/;

function receiveSerialLine(line) {
  const text = String(line).trim();
  const streak = MISS_STREAK_LINE.exec(text);
  if (streak) {
    missStreak = Number(streak[1]);
    maxMissStreak = Number(streak[2]);
  } else if (text === "Progress Reset.") {
    missStreak = 0;
  }
  statusLine = text;
  renderPanel();
}

// The Sketch paints its Target Zone as an amber run, so the panel reads its size
// back from the pixels instead of duplicating the rules that place it.
// b === 0 && r > g > 0 is exact for CHSV(40, 255, level) as the Facade renders
// it: the background and the pulse and endpoint whites are grey, the Miss Marker
// and the reset flash are red, and hit frames are green. A Pulse crossing the
// Zone overwrites one amber pixel, so the bounds are the first and last amber
// pixel rather than the longest unbroken run.
function targetZoneBounds() {
  const count = ledPixels.length / 3;
  let start = -1;
  let end = -1;

  for (let index = 0; index < count; index += 1) {
    const amber =
      ledPixels[index * 3 + 2] === 0 &&
      ledPixels[index * 3] > ledPixels[index * 3 + 1] &&
      ledPixels[index * 3 + 1] > 0;
    if (!amber) continue;
    if (start < 0) start = index;
    end = index;
  }

  return { start, end };
}

function receiveFrame(frame, level) {
  // The published view is borrowed and expires with the call, so the page keeps
  // its own snapshot.
  if (ledPixels.length !== frame.length) ledPixels = new Uint8Array(frame.length);
  ledPixels.set(frame);
  brightness = level;

  const zone = targetZoneBounds();
  zoneStart = zone.start;
  zoneEnd = zone.end;
  renderPanel();
}

function fail(error) {
  liveInstance = 0;
  currentModule = null;
  for (const side of ["left", "right"]) {
    buttons[side].disabled = true;
    buttons[side].classList.remove("is-held");
    buttons[side].setAttribute("aria-pressed", "false");
  }
  statusLine = "Sketch failed to start. See console for details.";
  renderPanel();
  console.error(error);
}

// Every boot asks for the glue: a rebuilt Sketch is a different module, and in
// development the watcher rewrites both artifacts, so neither may come from a
// cached copy.
async function loadFactory() {
  if (import.meta.env.DEV) {
    const stamp = Date.now();
    const { default: factory } = await import(
      /* @vite-ignore */ `./generated/sketch.js?t=${stamp}`
    );
    return { factory, wasm: `${sketchWasmUrl}?t=${stamp}` };
  }
  const { default: factory } = await import("./generated/sketch.js");
  return { factory, wasm: sketchWasmUrl };
}

async function startSketch() {
  const instance = ++issuedInstance;
  liveInstance = 0;
  const previous = currentModule;
  currentModule = null;
  // The module being replaced takes its serial history with it: the new one runs
  // setup() from scratch and reports its own Miss Streak, so the panel forgets
  // what the previous build said and waits for the new one to speak.
  statusLine = IDLE_STATUS;
  missStreak = 0;
  renderPanel();

  const { factory, wasm } = await loadFactory();
  const module = await factory({
    locateFile: (file) => (file.endsWith(".wasm") ? wasm : file),
    // Pins 2 and 3 are the Sketch's BTN_LEFT and BTN_RIGHT. Both are configured
    // INPUT_PULLUP, so a launched Pulse reads LOW: 0 pressed, 1 released.
    readPin: (pin) =>
      instance === liveInstance &&
      ((pin === 2 && isHeld("left")) || (pin === 3 && isHeld("right")))
        ? 0
        : 1,
    serialAvailable: () => (instance === liveInstance ? serialInput.length : 0),
    serialRead: () =>
      instance === liveInstance && serialInput.length ? serialInput.shift() : -1,
    onLedFrame: (frame, level) => {
      if (instance === liveInstance) receiveFrame(frame, level);
    },
    onAbort: (what) => {
      if (instance === liveInstance) fail(new Error(String(what)));
    },
    // Serial.println() flushes its line buffer to the host through this hook;
    // anything the Sketch writes to stdout instead arrives as print().
    serialOutput: (line) => receiveSerialLine(String(line)),
    print: (line) => receiveSerialLine(String(line)),
    printErr: (...values) => console.error(...values),
  });

  // A newer build claimed the strip while this one was loading.
  if (instance !== issuedInstance) {
    module._stopSketch?.();
    return false;
  }

  currentModule = module;
  liveInstance = instance;
  previous?._stopSketch?.();
  return true;
}

if (import.meta.hot) {
  import.meta.hot.on("sketch-updated", () => {
    showNote("Sketch recompiled — the strip is running the new build.");
    startSketch().catch(fail);
  });
  import.meta.hot.on("sketch-failed", ({ output }) => {
    showNote("Sketch did not compile — the previous build is still running.");
    console.error(output);
  });
}

try {
  await startSketch();
} catch (error) {
  fail(error);
}

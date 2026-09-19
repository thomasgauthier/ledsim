#include <emscripten.h>

void setup();
void loop();

namespace {
void runSketchLoop() {
  loop();
}
}  // namespace

int main() {
  setup();

  // A browser-scheduled callback replaces Arduino's native infinite loop.
  // A frame rate of 0 asks Emscripten to use requestAnimationFrame.
  emscripten_set_main_loop(runSketchLoop, 0, true);
  return 0;
}

// The page stops a Sketch before replacing it. A compiled module cannot be
// migrated to a new build - a rebuild is a new module with its own heap - so
// the host cancels the running loop and drops the instance instead.
extern "C" EMSCRIPTEN_KEEPALIVE void stopSketch() {
  emscripten_cancel_main_loop();
}
